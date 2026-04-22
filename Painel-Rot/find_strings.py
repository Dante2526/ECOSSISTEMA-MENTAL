
import re

def find_all_strings(file_path):
    with open(file_path, 'rb') as f:
        data = f.read()
    
    # Busca por strings de pelo menos 3 caracteres
    ascii_strings = re.findall(b'[\x20-\x7E]{3,}', data)
    print(f"Total ASCII strings found: {len(ascii_strings)}")
    for s in ascii_strings[:50]: # Primeiras 50 para análise
        print(s.decode('ascii', errors='ignore'))

if __name__ == "__main__":
    find_all_strings('02230812.dat')
