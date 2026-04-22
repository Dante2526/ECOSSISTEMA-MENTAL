
import pypdf
import re

def extract_pdf_rules(file_path):
    print(f"--- Scanning {file_path} ---")
    reader = pypdf.PdfReader(file_path)
    text = ""
    for page in reader.pages:
        text += page.extract_text() + "\n"
    
    # Procura por números seguidos de unidades ou palavras chaves
    rules = []
    
    # Ex: Limites de velocidade
    vel_matches = re.findall(r'(\d+)\s*km/h', text, re.IGNORECASE)
    if vel_matches: rules.append(f"Velocidades encontradas: {set(vel_matches)} km/h")
    
    # Ex: Pressões
    psi_matches = re.findall(r'(\d+)\s*PSI', text, re.IGNORECASE)
    if psi_matches: rules.append(f"Pressões encontradas: {set(psi_matches)} PSI")
    
    # Ex: Tempos
    min_matches = re.findall(r'(\d+)\s*minutos', text, re.IGNORECASE)
    if min_matches: rules.append(f"Tempos (min): {set(min_matches)}")

    # Procura por frases com "EG" ou "Encanamento Geral"
    eg_lines = re.findall(r'.*?[Ee][Gg].*?|.*?[Ee]ncanamento [Gg]eral.*?', text)
    if eg_lines:
        print("Mencões ao EG:")
        for line in eg_lines[:10]: # Primeiras 10
            print(f"- {line.strip()}")

    print("\nResumo de potenciais limites:")
    for rule in rules:
        print(rule)

if __name__ == "__main__":
    extract_pdf_rules('ROF REV 10.pdf')
    print("\n" + "="*50 + "\n")
    extract_pdf_rules('Fundamentos de Operações de trem - MÓD1.pdf')
