import psutil
import time

killed = False
for conn in psutil.net_connections(kind='inet'):
    if conn.laddr.port == 8000 and conn.pid:
        try:
            p = psutil.Process(conn.pid)
            print(f"Found process {p.pid} ({p.name()}) listening on 8000. Terminating...")
            p.kill()
            killed = True
            time.sleep(1)
        except Exception as e:
            print(f"Error terminating {conn.pid}: {e}")

if not killed:
    print("No process found on port 8000.")
