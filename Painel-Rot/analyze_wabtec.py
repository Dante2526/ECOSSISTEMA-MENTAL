
import binascii

input_path = '02230812.dat'

try:
    with open(input_path, 'rb') as f:
        data = f.read()
        # Primeros 512 bytes
        print("--- HEX DUMP (First 512 bytes) ---")
        print(binascii.hexlify(data[:512], ' ').decode('utf-8'))
        
        print("\n--- STRINGS ---")
        # Busca por strings legíveis
        import re
        strings = re.findall(b'[\x20-\x7E]{4,}', data[:2048])
        for s in strings:
            print(s.decode('utf-8', errors='ignore'))
            
except Exception as e:
    print(f"Error: {e}")
