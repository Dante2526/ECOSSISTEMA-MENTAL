
import binascii

def find_velocity(file_path):
    with open(file_path, 'rb') as f:
        data = f.read()
    
    # Try to find common velocity tags
    # Some systems use 0x8D for velocity
    count_8d = data.count(b'\x8d')
    print(f"Tag 8D count: {count_8d}")
    
    # Also look for &B... pattern
    for b in range(0x80, 0x90):
        tag = bytes([0x26, 0x82, b])
        count = data.count(tag)
        if count > 0:
            print(f"Tag {binascii.hexlify(tag, ' ')}: {count}")

find_velocity(r'C:\Users\nayla\gravity\dats\02250421.dat')
