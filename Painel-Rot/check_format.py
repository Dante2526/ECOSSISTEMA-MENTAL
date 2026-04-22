
import binascii

def check_format(file_path):
    with open(file_path, 'rb') as f:
        data = f.read()
    
    # Check for DAS III tags
    das_iii_count = data.count(b'\x26\x82\x80')
    
    # Check for LDP markers (02 30 ... 10 03)
    ldp_count = 0
    for i in range(len(data) - 5):
        if data[i] == 0x02 and data[i+1] == 0x30:
            ldp_count += 1
            
    print(f"File: {file_path}")
    print(f"DAS III Tag Count (&B@): {das_iii_count}")
    print(f"LDP Marker Count (02 30): {ldp_count}")

check_format(r'C:\Users\nayla\gravity\dats\02250421.dat')
