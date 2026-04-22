
import os

def find_patterns(file_path):
    with open(file_path, 'rb') as f:
        data = f.read()
    
    # Procura por qualquer byte que tenha valor próximo a 90 (0x5A) por um tempo
    # e depois caia para 87 (0x57)
    
    print(f"Analyzing {file_path} (Size: {len(data)} bytes)...")
    
    # Tentar diferentes offsets (assumindo registros de 16 bytes por exemplo)
    record_size = 16
    num_records = len(data) // record_size
    
    for byte_index in range(record_size):
        values = []
        for r in range(num_records):
            values.append(data[r * record_size + byte_index])
        
        # Verifica se o valor médio está perto de 90
        avg = sum(values) / len(values) if values else 0
        if 80 < avg < 100:
            print(f"Found candidate at Byte Offset {byte_index}: Avg={avg:.2f}")
            # Verificando se cai para 87
            drops = [i for i, v in enumerate(values) if v < 88]
            if drops:
                print(f"  Drops detected at records: {drops[:10]}...")

if __name__ == "__main__":
    find_patterns('02230812.dat')
