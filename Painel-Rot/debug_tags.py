
import binascii

def search_tags(file_path):
    with open(file_path, 'rb') as f:
        data = f.read()
    
    print(f"File: {file_path}")
    
    tags = {
        "EG_80": [0x26, 0x82, 0x80],
        "EG_81": [0x26, 0x82, 0x81],
        "BC": [0x84, 0xA8, 0x8A],
        "NOTCH_82": [0x82],
        "TIME_SYNC": [0xEB]
    }
    
    for name, tag in tags.items():
        count = 0
        indices = []
        for i in range(len(data) - len(tag)):
            match = True
            for j in range(len(tag)):
                if data[i+j] != tag[j]:
                    match = False
                    break
            if match:
                count += 1
                if count < 5:
                    indices.append(i)
        
        print(f"Tag {name} ({binascii.hexlify(bytes(tag), ' ')}): {count} occurrences")
        if count > 0:
            print(f"  First indices: {indices}")
            # Show value for EG
            if name.startswith("EG"):
                idx = indices[0]
                val_byte = data[idx + len(tag)]
                print(f"  Sample value at first index: {val_byte} (Decoded: {val_byte - 64})")

search_tags(r'C:\Users\nayla\gravity\dats\02250421.dat')
