import os
import sys
import time
import sqlite3
import subprocess

pid = 83140
db_path = "/home/ubuntu/fub_automation/data/fub_automation.sqlite3"
log_path = "/home/ubuntu/fub_automation/daily_run.log"

def is_running(pid):
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False

print(f"Monitoring PID {pid}...", flush=True)

last_tail = ""
while is_running(pid):
    # Get latest 2 lines of log
    try:
        tail_out = subprocess.check_output(["tail", "-n", "2", log_path]).decode("utf-8").strip()
        if tail_out != last_tail:
            print(f"--- LOG UPDATE ---\n{tail_out}\n", flush=True)
            last_tail = tail_out
    except Exception as e:
        print(f"Error reading log: {e}", flush=True)
        
    # Get counts from SQLite
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT action, status, COUNT(*) FROM audit_log WHERE created_at > '2026-06-07T19:41:00' GROUP BY action, status;")
        rows = cursor.fetchall()
        print(f"Audit Log Counts: {rows}", flush=True)
        conn.close()
    except Exception as e:
        print(f"Error reading DB: {e}", flush=True)
        
    time.sleep(15)

print("Process ended!", flush=True)
