
import json

def analyze_event_flood():
    # Use the existing all_telemetry.json and simulate the auditor
    with open('all_telemetry.json', 'r') as f:
        data = json.load(f)
    
    eg = [p['eg'] for p in data]
    events = []
    
    lastPressure = eg[0]
    for i in range(1, len(eg)):
        currentP = eg[i]
        drop = lastPressure - currentP
        
        # Test Reducao Forte logic
        if drop > 18 and currentP > 40:
            events.append('REDUCAO_FORTE')
            
        # Test Ciclica logic
        # (simplified here just to see counts)
        
        lastPressure = currentP
        
    from collections import Counter
    print(f"Total simulated events: {len(events)}")
    print("Event counts:", Counter(events))

if __name__ == "__main__":
    analyze_event_flood()
