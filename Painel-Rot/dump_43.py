
import binascii

def dump_stride(file_path, stride):
    with open(file_path, 'rb') as f:
        data = f.read()
    
    num_records = len(data) // stride
    print(f"Dumping {min(20, num_records)} records with stride {stride}:")
    for i in range(min(20, num_records)):
        record = data[i*stride : (i+1)*stride]
        print(f"{i:03d} | {binascii.hexlify(record, ' ').decode('utf-8')}")

if __name__ == "__main__":
    dump_stride('02230812.dat', 43)
