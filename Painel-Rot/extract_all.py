
import json
import os

def extract_all_offsets(file_path, stride):
    with open(file_path, 'rb') as f:
        data = f.read()
    
    num_records = len(data) // stride
    all_data = {}
    
    for offset in range(stride):
        values = []
        for r in range(num_records):
            values.append(data[r * stride + offset])
        
        # Filtra offsets que são puramente estáticos
        if len(set(values)) > 2:
            all_data[f"offset_{offset}"] = values
            
    with open('all_telemetry.json', 'w') as f:
        json.dump(all_data, f)
    print(f"Extracted {len(all_data)} non-static offsets to all_telemetry.json")

if __name__ == "__main__":
    extract_all_offsets('02230812.dat', 43)
