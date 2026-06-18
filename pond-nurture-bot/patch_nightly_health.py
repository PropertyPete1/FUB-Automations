"""Patch nightly_health.py to add pond nurture SMS error handling."""

path = "/home/ubuntu/fub_automation/nightly_health.py"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Exact text as it appears in the file (verified via repr output)
old = (
    "            # \u2500\u2500 Unknown error type: log for awareness \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n"
    "            warnings.append(\n"
    "                f\"Unknown error type '{action}' ({count} occurrences). \"\n"
    "                f\"Sample: {str(sample_error)[:100]}\"\n"
    "            )"
)

new = (
    "            # \u2500\u2500 pond_nurture SMS failures: flag for awareness, no auto-fix \u2500\u2500\u2500\u2500\u2500\u2500\u2500\n"
    "            if action == \"pond_nurture\" and \"sms_error\" in str(details_raw or \"\"):\n"
    "                warnings.append(\n"
    "                    f\"{count} pond nurture SMS failure(s) today. \"\n"
    "                    f\"FUB /textMessages API may be having issues. \"\n"
    "                    f\"Sample error: {str(sample_error)[:100]}.\"\n"
    "                )\n"
    "                log.warning(\"Pond nurture SMS errors detected: %d failure(s)\", count)\n"
    "                continue\n"
    "\n"
    "            # \u2500\u2500 Unknown error type: log for awareness \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n"
    "            warnings.append(\n"
    "                f\"Unknown error type '{action}' ({count} occurrences). \"\n"
    "                f\"Sample: {str(sample_error)[:100]}\"\n"
    "            )"
)

# Verify old text is present
if old not in content:
    raise SystemExit(f"ERROR: old text not found. File has {len(content)} chars.")

new_content = content.replace(old, new, 1)
assert new_content != content, "ERROR: replacement had no effect"

with open(path, "w", encoding="utf-8") as f:
    f.write(new_content)

print("SUCCESS: nightly_health.py patched with SMS error handling")
