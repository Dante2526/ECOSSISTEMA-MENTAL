
def find_spacing(file_path, byte_val):
    with open(file_path, 'rb') as f:
        data = f.read()
    
    indices = [i for i, b in enumerate(data) if b == byte_val]
    if len(indices) < 2:
        print(f"Not enough occurrences of {byte_val}")
        return
    
    diffs = []
    for i in range(len(indices) - 1):
        diffs.append(indices[i+1] - indices[i])
    
    from collections import Counter
    print(f"Common spacings for byte 0x{byte_val:02x}:")
    for d, count in Counter(diffs).most_common(10):
        print(f"Spacing {d}: {count} times")

if __name__ == "__main__":
    find_spacing('02230812.dat', 0x90)
