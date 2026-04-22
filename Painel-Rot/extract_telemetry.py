
import json
import os

def unescape_wabtec(data):
    """Remove DLE escaping from a block"""
    out = bytearray()
    i = 0
    while i < len(data):
        if data[i] == 0x10 and i + 1 < len(data):
            out.append(data[i+1])
            i += 2
        else:
            out.append(data[i])
            i += 1
    return out

def extract_from_ldp(file_path):
    print(f"Reading {file_path}...")
    if not os.path.exists(file_path):
        print(f"Error: {file_path} not found")
        return []

    with open(file_path, 'rb') as f:
        data = f.read()

    telemetry = []
    i = 0
    while i < len(data) - 1:
        # Start marker for Wabtec LDP records
        if data[i] == 0x02 and data[i+1] == 0x30:
            start = i + 2
            j = start
            record_found = False
            while j < len(data):
                if data[j] == 0x10: # DLE escape
                    j += 2
                    continue
                if data[j] == 0x03: # ETX terminator
                    raw_payload = data[start:j]
                    payload = unescape_wabtec(raw_payload)
                    
                    if len(payload) == 9:
                        # Mapeamento Calibrado baseado nos prints dos inspetores
                        entry = {
                            "offset": i,
                            "speed": payload[0] * 0.5,      # Velocidade (B0)
                            "eg": payload[1] * 0.5,         # Encanamento Geral (B1)
                            "fi": payload[2] * 0.5,         # Freio Independente (B2)
                            "current": payload[3] * 10.0,    # Corrente (B3) - Chute inicial baseado em 1800A max
                            "throttle": payload[6] & 0x0F,  # Acelerador (B6 nibble baixo)
                            "buzzer": bool(payload[7] & 0x10), # Buzina (B7 bit 4?)
                            "pcr": bool(payload[7] & 0x01),    # Chave PCR (B7 bit 0?)
                        }
                        telemetry.append(entry)
                    
                    i = j + 1
                    record_found = True
                    break
                j += 1
            if not record_found: break
        else:
            i += 1
    
    return telemetry

if __name__ == "__main__":
    # Tenta ler o arquivo mais novo fornecido pelo usuário
    new_dat = r'C:\Users\nayla\gravity\dats\3983160426.DAT'
    results = extract_from_ldp(new_dat)
    
    if results:
        output_file = 'all_telemetry.json'
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"Sucesso: {len(results)} pontos extraídos para {output_file}")
    else:
        print("Nenhum dado extraído.")
