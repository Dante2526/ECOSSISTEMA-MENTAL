
import pypdf
import re
import sys

# Garante que a saída seja em UTF-8 para evitar erros no Windows
sys.stdout.reconfigure(encoding='utf-8')

def extract_pdf_rules(file_path):
    print(f"--- Scanning {file_path} ---")
    try:
        reader = pypdf.PdfReader(file_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        
        # Procura por números seguidos de unidades
        # Limites de velocidade (Ex: 40 km/h)
        vel_matches = re.findall(r'(\d+)\s*km/h', text, re.IGNORECASE)
        # Pressões (Ex: 90 PSI)
        psi_matches = re.findall(r'(\d+)\s*PSI', text, re.IGNORECASE)
        # Pressões (Ex: 7.0 kgf/cm2)
        kgf_matches = re.findall(r'(\d+[.,]?\d*)\s*kgf/cm', text, re.IGNORECASE)

        print("\nPotenciais Limites encontrados:")
        if vel_matches: print(f"- Velocidades: {sorted(list(set(vel_matches)))} km/h")
        if psi_matches: print(f"- Pressões: {sorted(list(set(psi_matches)))} PSI")
        if kgf_matches: print(f"- Pressões: {sorted(list(set(kgf_matches)))} kgf/cm2")

        # Procura por parágrafos que mencionem "Encanamento Geral"
        eg_patterns = [r'Encanamento Geral', r'EG']
        for pattern in eg_patterns:
            matches = re.findall(rf'([^.!?]*?{pattern}[^.!?]*?[.!?])', text)
            if matches:
                print(f"\nTrechos sobre {pattern}:")
                for m in matches[:5]: 
                    # Limpa espaços e quebras
                    clean = re.sub(r'\s+', ' ', m).strip()
                    if len(clean) > 20: print(f"- {clean}")

    except Exception as e:
        print(f"Error reading {file_path}: {e}")

if __name__ == "__main__":
    files = ['ROF REV 10.pdf', 'Fundamentos de Operações de trem - MÓD1.pdf']
    for f in files:
        extract_pdf_rules(f)
        print("\n" + "="*50 + "\n")
