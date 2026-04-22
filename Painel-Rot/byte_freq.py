
def count_bytes(file_path):
    with open(file_path, 'rb') as f:
        data = f.read()
    
    from collections import Counter
    counts = Counter(data)
    
    # Most common bytes
    print("Most common bytes:")
    for b, count in counts.most_common(20):
        print(f"0x{b:02x} ({b:d}): {count}")

if __name__ == "__main__":
    count_bytes('02230812.dat')
