
def find_stride(file_path):
    with open(file_path, 'rb') as f:
        data = f.read()
    
    print(f"File size: {len(data)}")
    
    # Testa strides de 4 a 64
    for stride in range(4, 65):
        matches = 0
        total = 0
        for i in range(len(data) - stride):
            if data[i] == data[i + stride]:
                matches += 1
            total += 1
        
        score = matches / total if total > 0 else 0
        if score > 0.3: # Se mais de 30% dos bytes coincidem com o stride, é um bom sinal
            print(f"Stride {stride}: Score {score:.4f}")

if __name__ == "__main__":
    find_stride('02230812.dat')
