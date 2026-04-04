import socket
import psutil
import requests

SPACETIMEDB_URI = "https://testnet.spacetimedb.com" 
MODULE_NAME = "fleet-50e9n"


def get_system_vitals():
    """Collects CPU, memory, and disk usage and returns them in the order the reducer expects."""
    # [pc_id, cpu_usage, memory_usage, disk_usage]
    return [
        socket.gethostname(),
        float(psutil.cpu_percent(interval=1)),
        float(psutil.virtual_memory().percent),
        float(psutil.disk_usage('/').percent)
    ]

def send_heartbeat():
    """Sends the system vitals directly to the SpacetimeDB HTTP API."""
    vitals = get_system_vitals()
    print(f"Reporting vitals array: {vitals}")
    
    # The SpacetimeDB API endpoint to call a reducer
    url = f"{SPACETIMEDB_URI}/database/{MODULE_NAME}/call/send_heartbeat"
    
    try:
        # We just POST the arguments as a JSON array
        response = requests.post(url, json={"args": vitals})
        
        if response.status_code == 200:
            print("✅ Heartbeat sent successfully!")
        else:
            print(f"❌ Failed to send heartbeat (Status {response.status_code}): {response.text}")
            
    except requests.exceptions.ConnectionError:
            print(f"❌ Connection Error: Could not reach SpacetimeDB at {SPACETIMEDB_URI}")

if __name__ == "__main__":
    send_heartbeat()
