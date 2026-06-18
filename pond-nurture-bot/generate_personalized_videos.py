"""
Personalized Agent Video Generator — Lifestyle Design Realty
Generates 10-second vertical (720×1280) Reels/TikTok promo videos per agent.

Font upgrade: Uses Pillow (PIL) with system TTF fonts for a modern luxury look:
  - NotoSerif-Bold for headlines (elegant serif)
  - OpenSans-Bold for body/CTA text (clean, modern sans-serif)
  - OpenSans-Regular for subtitles
"""

import os
import datetime
import numpy as np
import cv2

from PIL import Image, ImageDraw, ImageFont

# ── Font paths (system TTF) ────────────────────────────────────────────────────
FONT_SERIF_BOLD  = "/usr/share/fonts/truetype/noto/NotoSerif-Bold.ttf"
FONT_SANS_BOLD   = "/usr/share/fonts/truetype/open-sans/OpenSans-Bold.ttf"
FONT_SANS_REG    = "/usr/share/fonts/truetype/open-sans/OpenSans-Regular.ttf"
FONT_SANS_SEMI   = "/usr/share/fonts/truetype/open-sans/OpenSans-Semibold.ttf"

def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    """Load a TTF font; fall back to default if unavailable."""
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

# ── Deal data fallback ─────────────────────────────────────────────────────────
try:
    from fub_automation.pdf_generator import get_deal_for_city
except ModuleNotFoundError:
    try:
        from src.fub_automation.pdf_generator import get_deal_for_city
    except ModuleNotFoundError:
        def get_deal_for_city(city):
            deals = {
                "Austin": {
                    "base_price": "$349,000",
                    "upgrade_price": "$450,000",
                    "rate": "4.25%",
                    "est_base_payment": "$1,720/mo"
                },
                "San Antonio": {
                    "base_price": "$311,000",
                    "upgrade_price": "$415,000",
                    "rate": "3.99%",
                    "est_base_payment": "$1,480/mo"
                },
                "DFW": {
                    "base_price": "$399,000",
                    "upgrade_price": "$520,000",
                    "rate": "4.50%",
                    "est_base_payment": "$2,020/mo"
                }
            }
            return deals.get(city, deals["San Antonio"])

# ── Active agents only — Luke and Bebe excluded ────────────────────────────────
AGENTS = [
    {"name": "Tiffany",  "city": "Austin",       "phone": "512-200-1402"},
    {"name": "Steven",   "city": "Austin",        "phone": "512-939-8880"},
    {"name": "Abby",     "city": "Austin",        "phone": "956-530-7511"},
    {"name": "Stefanie", "city": "San Antonio",   "phone": "210-906-5048"},
    {"name": "Laila",    "city": "San Antonio",   "phone": "210-845-9491"},
    {"name": "Peter",    "city": "San Antonio",   "phone": "520-373-7839"},
    {"name": "Irma",     "city": "DFW",           "phone": "512-502-4126"},
]

# ── Weekly rotating visual themes ─────────────────────────────────────────────
THEMES = [
    # Week 0: Midnight Gold
    {"base_color": (15, 23, 42),  "glow_color": (100, 70, 30),  "gold": (240, 190, 100)},
    # Week 1: Emerald Velvet
    {"base_color": (10, 30, 15),  "glow_color": (40, 90, 50),   "gold": (255, 210, 140)},
    # Week 2: Royal Sapphire
    {"base_color": (10, 15, 40),  "glow_color": (30, 50, 110),  "gold": (230, 200, 160)},
    # Week 3: Champagne Rose
    {"base_color": (25, 10, 20),  "glow_color": (90, 40, 60),   "gold": (245, 170, 150)},
]

def get_theme():
    week_num = datetime.datetime.now().isocalendar()[1]
    return THEMES[week_num % len(THEMES)]

# ── PIL text helper ────────────────────────────────────────────────────────────
def draw_centered_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    y: int,
    font: ImageFont.FreeTypeFont,
    fill: tuple,
    width: int,
    shadow_offset: int = 2,
    shadow_color: tuple = (0, 0, 0, 180),
):
    """Draw horizontally centered text with a drop shadow."""
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    x = (width - text_w) // 2
    # Shadow
    draw.text((x + shadow_offset, y + shadow_offset), text, font=font, fill=shadow_color)
    # Main text
    draw.text((x, y), text, font=font, fill=fill)

def draw_left_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    x: int,
    y: int,
    font: ImageFont.FreeTypeFont,
    fill: tuple,
    shadow_offset: int = 1,
):
    draw.text((x + shadow_offset, y + shadow_offset), text, font=font, fill=(0, 0, 0, 160))
    draw.text((x, y), text, font=font, fill=fill)

# ── Frame builder ──────────────────────────────────────────────────────────────
def create_luxury_frame(
    width: int, height: int,
    frame_idx: int, total_frames: int,
    agent_name: str, city: str, phone_num: str,
    deal_info: dict, theme: dict,
) -> np.ndarray:
    """Build one frame as a numpy array (BGR) using Pillow for all text rendering."""

    # 1. Gradient background (numpy, same as before)
    X, Y = np.meshgrid(np.linspace(-1, 1, width), np.linspace(-1, 1, height))
    dist = np.sqrt(X**2 + Y**2)

    base_r, base_g, base_b = theme["base_color"]
    glow_r, glow_g, glow_b = theme["glow_color"]

    pulse = 1.0 + 0.08 * np.sin(2 * np.pi * frame_idx / 60.0)
    glow_r = int(min(255, glow_r * pulse))
    glow_g = int(min(255, glow_g * pulse))
    glow_b = int(min(255, glow_b * pulse))

    vignette = np.clip(1.0 - dist * 0.8, 0, 1)

    r = base_r + (glow_r - base_r) * vignette
    g = base_g + (glow_g - base_g) * vignette
    b = base_b + (glow_b - base_b) * vignette

    # Build RGB numpy frame for PIL
    frame_rgb = np.zeros((height, width, 3), dtype=np.uint8)
    frame_rgb[:, :, 0] = r.astype(np.uint8)
    frame_rgb[:, :, 1] = g.astype(np.uint8)
    frame_rgb[:, :, 2] = b.astype(np.uint8)

    # 2. Gold border (OpenCV, fast)
    gold_cv = (theme["gold"][2], theme["gold"][1], theme["gold"][0])  # BGR
    cv2.rectangle(frame_rgb, (20, 20), (width - 20, height - 20), gold_cv, 3)

    # 3. Animated gold dust particles (OpenCV)
    np.random.seed(42)
    for i in range(15):
        speed = 0.5 + (i % 3) * 0.2
        oy = int((frame_idx * speed + i * 50) % (height - 60)) + 30
        ox = int((i * 80 + np.sin(frame_idx / 15.0 + i) * 15) % (width - 60)) + 30
        size = 2 + (i % 3)
        alpha = 0.12 + 0.08 * np.sin(frame_idx / 10.0 + i)
        overlay = frame_rgb.copy()
        cv2.circle(overlay, (ox, oy), size, gold_cv, -1)
        cv2.addWeighted(overlay, alpha, frame_rgb, 1.0 - alpha, 0, frame_rgb)

    # 4. Convert to PIL RGBA for text rendering
    pil_img = Image.fromarray(frame_rgb, "RGB").convert("RGBA")
    draw = ImageDraw.Draw(pil_img)

    gold_rgba   = (*theme["gold"], 255)
    white_rgba  = (255, 255, 255, 255)
    silver_rgba = (200, 210, 220, 200)

    # ── Fonts ──────────────────────────────────────────────────────────────────
    f_watermark = load_font(FONT_SANS_SEMI,  22)
    f_title     = load_font(FONT_SERIF_BOLD, 52)
    f_highlight = load_font(FONT_SANS_BOLD,  30)
    f_badge     = load_font(FONT_SANS_SEMI,  34)
    f_sub       = load_font(FONT_SANS_REG,   24)
    f_footer    = load_font(FONT_SANS_BOLD,  22)
    f_card_hdr  = load_font(FONT_SERIF_BOLD, 32)
    f_card_name = load_font(FONT_SERIF_BOLD, 54)
    f_card_sub  = load_font(FONT_SANS_REG,   22)
    f_card_ph   = load_font(FONT_SANS_BOLD,  30)
    f_card_cta  = load_font(FONT_SANS_SEMI,  20)

    # 5. Watermark — top center
    draw_centered_text(draw, "LIFESTYLE DESIGN REALTY", 48, f_watermark, silver_rgba, width)
    # Thin gold accent line
    line_x1, line_x2 = (width - 100) // 2, (width + 100) // 2
    draw.line([(line_x1, 80), (line_x2, 80)], fill=(*theme["gold"], 160), width=1)

    # 6. Main headline
    draw_centered_text(draw, "TODAY'S BEST DEAL", height // 2 - 175, f_title, gold_rgba, width)

    # 7. Deal highlights
    highlights = [
        (f"HOMES FROM {deal_info.get('base_price', '$311k')}", white_rgba),
        (f"RATE: {deal_info.get('rate', '3.99%')}", gold_rgba),
        (f"EST. PAYMENT: {deal_info.get('est_base_payment', '$1,480/mo')}", white_rgba),
    ]
    y_start = height // 2 - 90
    for idx, (text, color) in enumerate(highlights):
        draw_centered_text(draw, text, y_start + idx * 48, f_highlight, color, width)

    # 8. Agent badge (pulsing scale via font size)
    pulse_extra = int(2 * np.sin(2 * np.pi * frame_idx / 45.0))
    f_badge_pulse = load_font(FONT_SANS_SEMI, 34 + pulse_extra)
    draw_centered_text(draw, f"Curated by {agent_name}", height // 2 + 80, f_badge_pulse, white_rgba, width)

    # 9. City subtitle
    draw_centered_text(draw, f"{city.upper()} METRO", height // 2 + 130, f_sub, gold_rgba, width)

    # 10. Contact card (fades in at frame 210)
    if frame_idx >= 210:
        alpha_card = min(1.0, (frame_idx - 210) / 15.0)

        # Semi-transparent dark panel
        panel_y1, panel_y2 = height // 2 - 210, height // 2 + 210
        panel_x1, panel_x2 = 55, width - 55
        panel_layer = Image.new("RGBA", pil_img.size, (0, 0, 0, 0))
        panel_draw = ImageDraw.Draw(panel_layer)
        panel_alpha = int(230 * alpha_card)
        panel_draw.rectangle(
            [(panel_x1, panel_y1), (panel_x2, panel_y2)],
            fill=(8, 12, 28, panel_alpha),
        )
        # Gold border
        border_color = (*theme["gold"], int(200 * alpha_card))
        panel_draw.rectangle(
            [(panel_x1, panel_y1), (panel_x2, panel_y2)],
            outline=border_color, width=2,
        )
        pil_img = Image.alpha_composite(pil_img, panel_layer)
        draw = ImageDraw.Draw(pil_img)

        # Card content
        card_gold = (*theme["gold"], int(255 * alpha_card))
        card_white = (255, 255, 255, int(255 * alpha_card))
        card_silver = (190, 200, 215, int(200 * alpha_card))

        draw_centered_text(draw, "CONNECT WITH ME", panel_y1 + 44, f_card_hdr, card_gold, width)
        # Divider
        div_alpha = int(120 * alpha_card)
        draw.line(
            [(panel_x1 + 40, panel_y1 + 82), (panel_x2 - 40, panel_y1 + 82)],
            fill=(120, 140, 160, div_alpha), width=1,
        )
        # Agent name
        draw_centered_text(draw, agent_name.upper(), panel_y1 + 110, f_card_name, card_white, width)
        # Title
        draw_centered_text(draw, "Lifestyle Design Realty Partner", panel_y1 + 175, f_card_sub, card_silver, width)
        # Phone
        ph_pulse = int(2 * np.sin(2 * np.pi * frame_idx / 30.0))
        f_ph_pulse = load_font(FONT_SANS_BOLD, 30 + ph_pulse)
        draw_centered_text(draw, f"Call / Text: {phone_num}", panel_y1 + 240, f_ph_pulse, card_gold, width)
        # CTA
        draw_centered_text(
            draw,
            'Comment "HOME" for builder & community info',
            panel_y2 - 50, f_card_cta, card_white, width,
        )

    else:
        # Flashing footer CTA
        if (frame_idx // 15) % 2 == 0:
            cta_color = white_rgba
        else:
            cta_color = gold_rgba
        draw_centered_text(
            draw,
            'COMMENT "HOME" TO UNLOCK BUILDER & COMMUNITY DETAILS',
            height - 70, f_footer, cta_color, width,
        )

    # 11. Convert back to BGR numpy for OpenCV VideoWriter
    frame_rgb_out = np.array(pil_img.convert("RGB"))
    frame_bgr = cv2.cvtColor(frame_rgb_out, cv2.COLOR_RGB2BGR)
    return frame_bgr


def generate_agent_video(agent_name: str, city: str, phone_num: str, output_path: str):
    width, height = 720, 1280
    fps = 30
    duration_sec = 10
    total_frames = fps * duration_sec

    deal_info = get_deal_for_city(city)
    theme = get_theme()

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    print(f"Rendering {duration_sec}s video for {agent_name} ({city}) → {output_path} ...")
    for frame_idx in range(total_frames):
        frame = create_luxury_frame(
            width, height, frame_idx, total_frames,
            agent_name, city, phone_num, deal_info, theme,
        )
        out.write(frame)

    out.release()
    print(f"  ✓ Done: {output_path}")


def main():
    output_dir = "/home/ubuntu/webdev-static-assets/videos"
    os.makedirs(output_dir, exist_ok=True)

    print("Starting Personalized Agent Video Generation (Luxury Font Edition)...")
    for agent in AGENTS:
        filename = f"LDR_Promo_{agent['name'].lower()}_{agent['city'].lower()}_10s.mp4"
        output_path = os.path.join(output_dir, filename)
        generate_agent_video(agent["name"], agent["city"], agent["phone"], output_path)

    print("\nAll agent videos generated successfully!")


if __name__ == "__main__":
    main()
