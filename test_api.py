import requests
import json

try:
    print("Requesting courses from API...")
    r = requests.get("http://localhost:8000/courses")
    print(f"Status Code: {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        print(f"Got {len(data)} courses.")
        print(json.dumps(data, indent=2))
    else:
        print(f"Error: {r.text}")
except Exception as e:
    print(f"Failed to connect: {e}")
