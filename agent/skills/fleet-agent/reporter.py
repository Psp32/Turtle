# reporter.py
import requests

SPACETIMEDB_URI = "https://testnet.spacetimedb.com/database/fleet-control"

def push_result_to_db(task_id: int, result: dict, safety_check: dict):
    """Calls the report_result reducer in SpacetimeDB over HTTP."""
    print(f"[Reporter] Pushing results for Task {task_id}...")
    
    # Logic to determine final status
    status = "completed" if result['exit_code'] == 0 else "failed"
    if not safety_check['allowed']:
        status = "blocked"

    try:
        # Hit the report_result reducer
        res = requests.post(f"{SPACETIMEDB_URI}/call/report_result", json={"args": [
            task_id,
            status,
            result['stdout'],
            result['stderr'],
            result['exit_code'],
            safety_check['reason']
        ]})
        
        if res.status_code == 200:
            print(f"[Reporter] DB Sync complete. Status: {status}")
        else:
            print(f"[Reporter] Sync failed: {res.text}")
    except Exception as e:
        print(f"[Reporter] Sync error: {e}")
