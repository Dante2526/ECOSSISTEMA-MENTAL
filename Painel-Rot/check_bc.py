
import binascii

def check_bc_tag(file_path):
    with open(file_path, 'rb') as f:
        data = f.read()
    
    tag = [0x84, 0xA8, 0x8A]
    print(f"Searching for BC tag {binascii.hexlify(bytes(tag), ' ')}...")
    
    values = []
    for i in range(len(data) - 4):
        if data[i:i+3] == bytes(tag):
            values.append(data[i+3])
            
    print(f"Found {len(values)} occurrences.")
    if values:
        print(f"Sample raw values: {values[:10]}")
        print(f"Avg: {sum(values)/len(values):.1f}")

check_bc_tag(r'C:\Users\nayla\gravity\dats\02250421.dat')
