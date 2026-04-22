
import matplotlib.pyplot as plt
import numpy as np

def analyze_dat(file_path):
    with open(file_path, 'rb') as f:
        data = f.read()
    
    # Vamos assumir registros de tamanho fixo. 
    # Tentaremos vários tamanhos de registro (ex: 8, 16, 24, 32 bytes)
    # E plotar os bytes em posições específicas para ver se formam curvas legíveis.
    
    for record_size in [8, 16, 24, 32]:
        num_records = len(data) // record_size
        plt.figure(figsize=(15, 10))
        plt.title(f"Record Size: {record_size} bytes")
        
        # Plotar os primeiros 8 bytes de cada registro como canais diferentes
        for i in range(min(record_size, 8)):
            channel_data = []
            for r in range(num_records):
                val = data[r * record_size + i]
                channel_data.append(val)
            plt.plot(channel_data, label=f"Byte {i}")
        
        plt.legend()
        plt.savefig(f"analysis_rs{record_size}.png")
        plt.close()

if __name__ == "__main__":
    analyze_dat('02230812.dat')
