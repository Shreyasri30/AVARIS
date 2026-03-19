import sys
import traceback
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from backend.api.routes import router
    print("Successfully imported router!")
    # Print all routes to see if /upload-prescription is there
    for route in router.routes:
        print(route.path)
except Exception as e:
    print("IMPORT ERROR!")
    traceback.print_exc()
