
import json
from collections import Counter

def analyze_bits():
    with open('all_telemetry.json', 'r') as f:
        data = json.load(f)
        
    # We need raw bytes, but all_telemetry.json has only mapped ones.
    # I should re-parse the DAT file to see payload[7] raw.
    pass

if __name__ == "__main__":
    # Let's run a quick python script to re-parse and check bit activity
    import os
    dat_path = r'C:\Users\nayla\gravity\dats\3983160426.DAT'
    
    with open(dat_path, 'rb') as f:
        content = f.read()
        
    p7_values = []
    i = 0
    while i < len(content) - 1:
        if content[i] == 0x02 and content[i+1] == 0x30:
            start = i + 2
            j = start
            while j < len(content):
                if content[j] == 0x10: j += 2; continue
                if content[j] == 0x03:
                    # Payload extraction (simple, no unescape for just counting)
                    payload_part = content[start:j]
                    if len(payload_part) >= 8:
                         # Very crude unescape to get byte 7
                         raw = []
                         k = 0
                         while k < len(payload_part):
                             if payload_part[k] == 0x10: 
                                 raw.append(payload_part[k+1])
                                 k += 2
                             else:
                                 raw.append(payload_part[k])
                                 k += 1
                         if len(raw) >= 8:
                             p7_values.append(raw[7])
                    break
                j += 1
            i = j + 1
        else:
            i += 1
            
    print(f"Total packets analyzed: {len(p7_values)}")
    counts = Counter(p7_values)
    print("Top values for Byte 7 (binary):")
    for val, count in counts.most_common(10):
        print(f"{val:08b} (0x{val:02x}): {count}")

analyze_bits()
