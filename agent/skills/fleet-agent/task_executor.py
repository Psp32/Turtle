import subprocess
import socket
import time
import yaml
import re
import requests

SPACETIMEDB_URI = "https://testnet.spacetimedb.com/database/fleet-control"
PC_ID = socket.gethostname()

def check_armorclaw_policy(command: str) -> dict:
    """Validates the command against default.yaml safety policies."""
    try:
        with open("default.yaml", "r") as f:
            policy = yaml.safe_load(f)
            
        for rule in policy.get("rules", []):
            if re.search(rule["pattern"], command):
                return {
                    "allowed": False, 
                    "reason": rule["reason"]
                }
        return {"allowed": True, "reason": "Passed safety checks"}
    except FileNotFoundError:
         print("[ArmorClaw] Warning: default.yaml not found, allowing by default.")
         return {"allowed": True, "reason": "No policy file"}

def execute_shell_command(command: str):
    """Executes a shell command and captures the output."""
    print(f"[Executor] Running Command: {command}")
    try:
        # Run the command. timeout=3600 prevents infinite hangs during ML training.
        result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=3600)
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.returncode
        }
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "exit_code": 1}

def check_for_tasks():
    # Poll SpacetimeDB for tasks targeting this PC
    try:
        req = requests.post(f"{SPACETIMEDB_URI}/sql", json={"query": "SELECT * FROM TaskQueue"})
        for row in req.json():
            # Assuming row schema: [task_id, target_node, command, status]
            if row[1] == PC_ID and row[3] == "pending":
                return {"task_id": row[0], "command": row[2]}
    except:
        pass
    return None

def listen_loop():
    from reporter import push_result_to_db  # We will build this next!
    
    print(f"🤖 OpenClaw Executor [{PC_ID}] Online. Waiting for assignments...")
    while True:
        task = check_for_tasks()
        if task:
            print(f"\n[Executor] Received Task #{task['task_id']}: {task['command']}")
            
            # 1. Update status to running
            requests.post(f"{SPACETIMEDB_URI}/call/update_task_status", json={"args": [task['task_id'], "running"]})
            
            # 2. ArmorClaw Check
            safety_check = check_armorclaw_policy(task['command'])
            if not safety_check['allowed']:
                print(f"[ArmorClaw] 🚫 BLOCKED: {safety_check['reason']}")
                result = {"stdout": "", "stderr": f"Blocked by ArmorClaw", "exit_code": 403}
            else:
                print("[ArmorClaw] ✅ ALLOWED")
                # 3. Execution (e.g. running your ML model test)
                result = execute_shell_command(task['command'])
                print(f"[Executor] Output:\n{result['stdout'][:500]}") # Print first 500 chars
            
            # 4. Report Results
            push_result_to_db(task['task_id'], result, safety_check)
            
        time.sleep(2)

if __name__ == "__main__":

    listen_loop()
    # pass
