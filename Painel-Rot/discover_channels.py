
import binascii

def search_all_26_82(file_path):
    with open(file_path, 'rb') as f:
        data = f.read()
    
    print(f"File: {file_path}")
    
    found_tags = {}
    for i in range(len(data) - 4):
        if data[i] == 0x26 and data[i+1] == 0x82:
            tag_byte = data[i+2]
            val_byte = data[i+3]
            tag_hex = hex(tag_byte)
            if tag_hex not in found_tags:
                found_tags[tag_hex] = []
            found_tags[tag_hex].append(val_byte)
            
    for tag_hex, values in found_tags.items():
        avg = sum(values) / len(values)
        decoded_avg = avg - 64
        print(f"Tag 26 82 {tag_hex[2:]}: Count={len(values)}, Avg Raw={avg:.1f}, Avg Decoded={decoded_avg:.1f}")
        # Print some sample values
        print(f"  Samples: {values[:5]}")

search_all_26_82(r'C:\Users\nayla\gravity\dats\02250421.dat')
