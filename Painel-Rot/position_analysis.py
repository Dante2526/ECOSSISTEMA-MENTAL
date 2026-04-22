
import binascii

def analyze_positions(file_path, stride):
    with open(file_path, 'rb') as f:
        data = f.read()
    
    num_records = len(data) // stride
    positions = [{} for _ in range(stride)]
    
    for r in range(num_records):
        for i in range(stride):
            byte_val = data[r * stride + i]
            positions[i][byte_val] = positions[i].get(byte_val, 0) + 1
            
    print(f"Analysis of {num_records} records with stride {stride}:\n")
    for i in range(stride):
        # Encontra o byte mais comum para esta posição
        most_common = sorted(positions[i].items(), key=lambda x: x[1], reverse=True)[:3]
        common_str = ", ".join([f"0x{b:02x}:{count}" for b, count in most_common])
        print(f"Pos {i:02d} | {common_str}")

if __name__ == "__main__":
    analyze_positions('02230812.dat', 43)
