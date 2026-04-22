
import os

def unescape_wabtec(data):
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

def temporal_analysis(file_path):
    with open(file_path, 'rb') as f:
        data = f.read()
    
    payloads = []
    i = 0
    while i < len(data) - 1:
        if data[i] == 0x02 and data[i+1] == 0x30:
            start = i + 2
            j = start
            record_found = False
            while j < len(data):
                if data[j] == 0x10:
                    j += 2
                    continue
                if data[j] == 0x03:
                    p = unescape_wabtec(data[start:j])
                    if len(p) == 9: payloads.append(p)
                    i = j + 1
                    record_found = True
                    break
                j += 1
            if not record_found: break
        else:
            i += 1
            
    # Print a window where things are changing
    # We'll calculate "delta" for each byte
    for i in range(100, len(payloads) - 1, 100):
        p1 = payloads[i]
        p2 = payloads[i+1]
        # Just print 10 consecutive records
        print(f"\nWindow starting at record {i}:")
        print("Rec | B0 | B1 | B2 | B3 | B4 | B5 | B6 | B7 | B8 |")
        for j in range(i, i+10):
            p = payloads[j]
            print(f"{j:3} | " + " | ".join([f"{b:02x}" for b in p]) + " |")
        break # Just one window for now

if __name__ == "__main__":
    path = r'C:\Users\nayla\gravity\dats\3983160426.DAT'
    temporal_analysis(path)
