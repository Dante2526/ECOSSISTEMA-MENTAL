
import pypdf
import re
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

def extract_pdf_rules():
    # Encontra os arquivos PDF na pasta
    files = [f for f in os.listdir('.') if f.endswith('.pdf')]
    
    for file_path in files:
        print(f"\n--- Scanning {file_path} ---")
        try:
            reader = pypdf.PdfReader(file_path)
            text = ""
            for page in reader.pages:
                text += page.extract_text() + "\n"
            
            # Buscas específicas por limites
            vel = re.findall(r'(\d+)\s*km/h', text, re.IGNORECASE)
            psi = re.findall(r'(\d+)\s*PSI', text, re.IGNORECASE)
            # Procura por "EG" perto de números
            eg_rules = re.findall(r'EG.*?(\d+)', text, re.IGNORECASE | re.DOTALL)

            print("Resultados:")
            if vel: print(f"- Velocidades: {sorted(list(set(vel)))} km/h")
            if psi: print(f"- Pressões: {sorted(list(set(psi)))} PSI")
            if eg_rules: print(f"- EG referências: {sorted(list(set(eg_rules)))}")

        except Exception as e:
            print(f"Error reading {file_path}: {e}")

if __name__ == "__main__":
    extract_pdf_rules()
