import os
import datetime
from src.fub_automation.pdf_generator import get_deal_for_city, generate_deal_pdf

def main():
    local_date = datetime.date.today()
    cities = ["San Antonio", "Austin", "Dallas"]
    output_dir = "/home/ubuntu/fub_nurture_dashboard/client/public/pdf"
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"Generating localized PDFs for {local_date}...")
    for city in cities:
        deal = get_deal_for_city(city)
        pdf_filename = f"LDR_Deal_Spotlight_{deal['id']}_{local_date.strftime('%Y%m%d')}.pdf"
        pdf_local_path = os.path.join(output_dir, pdf_filename)
        
        try:
            generate_deal_pdf(deal, pdf_local_path)
            print(f" -> Successfully generated {city} PDF at: {pdf_local_path}")
        except Exception as e:
            print(f" -> Failed to generate {city} PDF: {e}")

if __name__ == "__main__":
    main()
