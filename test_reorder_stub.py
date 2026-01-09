import requests
import sys

BASE_URL = "http://localhost:8000"

def test_reorder():
    print("1. Creating Course...")
    r = requests.post(f"{BASE_URL}/upload-batch/", files=[], data={'course_name': 'Test Reorder Course'})
    # Note: upload-batch expects files, might fail if empty? 
    # Let's use backend/main.py logic or just create via DB directly if I could.
    # Actually upload-batch requires files.
    # Is there a create course endpoint? No... only implicit.
    # Wait, upload-batch requires files.
    
    # Let's manually insert into DB using sqlite3 for setup? 
    # Or just use the python repl with app imports? 
    # Accessing app logic directly is better.
    pass

if __name__ == "__main__":
    pass
