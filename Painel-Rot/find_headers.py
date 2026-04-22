
def find_headers(file_path):
    with open(file_path, 'rb') as f:
        data = f.read()
    
    # Procura por bytes de controle comuns no início de blocos
    for header in [0x24, 0x26, 0x22]:
        indices = [i for i, b in enumerate(data) if b == header]
        if len(indices) > 1:
            diffs = [indices[i+1] - indices[i] for i in range(len(indices)-1)]
            from collections import Counter
            c = Counter(diffs)
            print(f"Header 0x{header:02x} common spacings: {c.most_common(5)}")

if __name__ == "__main__":
    find_headers('02230812.dat')
