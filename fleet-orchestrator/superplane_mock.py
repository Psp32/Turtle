import time
import requests

# Coordinate with Member B if this URL changes
URI = "https://testnet.spacetimedb.com/database/fleet-control"

def check_stdb():
    try:
        req = requests.post(f"{URI}/sql", json={"query": "SELECT * FROM TaskQueue"})
        return req.json()
    except:
        return []

print("✈️ SuperPlane Auto-Orchestrator Online. Watching SpacetimeDB...")

while True:
    rows = check_stdb()
    
    chunks_done = 0
    aggregator_held = False
    aggregator_task_id = None

    for row in rows:
        # Assuming format: [task_id, target_node, command, status]
        task_id = row[0]
        status = row[3]
        
        # If tasks 1, 2, or 3 are done, count them
        if task_id in [1, 2, 3] and status == "completed":
            chunks_done += 1
            
        # If task 4 (or whichever task is the aggregator) is waiting
        if task_id == 4 and status == "held":
            aggregator_held = True
            aggregator_task_id = task_id

    # The Map-Reduce Trigger!
    if chunks_done == 3 and aggregator_held:
        print("\n[SuperPlane] Map phase complete (3/3 chunks trained).")
        print("[SuperPlane] Releasing Reduce Task (Aggregation)...")
        
        # We tell SpacetimeDB to change the aggregator task's status to 'pending' so an agent picks it up
        requests.post(
            f"{URI}/call/update_task_status", 
            json={"args": [aggregator_task_id, "pending"]}
        )
        print("[SuperPlane] Aggregation task successfully released.")
        
    time.sleep(2)
