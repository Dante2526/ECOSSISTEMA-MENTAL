
import json

def analyze_emergency():
    # Carrega os dados extraídos anteriormente
    with open('all_telemetry.json', 'r') as f:
        data = json.load(f)
        
    for i, p in enumerate(data):
        if p['eg'] < 10:
            print(f"Emergency detected at index {i}:")
            print(json.dumps(p, indent=2))
            
            # Check context around it
            start = max(0, i - 5)
            end = min(len(data), i + 5)
            print("\nContext:")
            for j in range(start, end):
                symbol = ">>" if j == i else "  "
                print(f"{symbol} {j}: EG={data[j]['eg']}, FI={data[j]['fi']}, Amp={data[j]['current']}, Throttle={data[j]['throttle']}, Buzzer={data[j]['buzzer']}")
            break

if __name__ == "__main__":
    analyze_emergency()
