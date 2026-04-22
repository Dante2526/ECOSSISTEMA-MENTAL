
import json

def analyze_current_profile():
    with open('all_telemetry.json', 'r') as f:
        data = json.load(f)
        
    # Analyze distribution of current when Speed is 0
    stationary_currents = [p['current'] for p in data if p['speed'] == 0]
    if not stationary_currents:
        print("No stationary data found")
        return
        
    print(f"Stationary Current Distribution:")
    print(f"Min: {min(stationary_currents)}")
    print(f"Max: {max(stationary_currents)}")
    print(f"Avg: {sum(stationary_currents)/len(stationary_currents):.1f}")
    
    # Count occurrences of non-zero current when stopped
    non_zero = [c for c in stationary_currents if c > 0]
    print(f"Non-zero stationary samples: {len(non_zero)} / {len(stationary_currents)}")
    
    if non_zero:
        print(f"Typical non-zero stationary current: {sum(non_zero)/len(non_zero):.1f}")

if __name__ == "__main__":
    analyze_current_profile()
