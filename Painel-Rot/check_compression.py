
import zlib

input_path = '02230812.dat'

try:
    with open(input_path, 'rb') as f:
        data = f.read()
        # Tenta decompress a partir de diferentes offsets
        for offset in range(16):
            try:
                decompressed = zlib.decompress(data[offset:])
                print(f"Success at offset {offset}! Decompressed size: {len(decompressed)}")
                with open('decompressed.bin', 'wb') as out:
                    out.write(decompressed)
                break
            except:
                pass
        else:
            print("Not zlib compressed (at least in the first 16 bytes).")
            
except Exception as e:
    print(f"Error: {e}")
