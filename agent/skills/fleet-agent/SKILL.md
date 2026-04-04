---
name: fleet-agent
description: Skill for reporting PC hardware telemetry and vitals to the SpacetimeDB cloud.
---

# Fleet Agent Operations

This skill allows the agent to monitor its own system resources and report its status.

## Usage
To report system health, execute the `heartbeat.py` script. This script gathers CPU, Memory, and Disk usage via `psutil` and sends the payload to the SpacetimeDB `send_heartbeat` reducer.
