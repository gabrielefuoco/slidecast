import os
import sys

# Ensure we can import from backend
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from backend.database import SessionLocal, Course, SlidePack

def check_db_and_storage():
    print("--- Database Content ---")
    db = SessionLocal()
    courses = db.query(Course).all()
    print(f"Found {len(courses)} courses in DB.")
    for c in courses:
        print(f"Course ID: {c.id}, Title: {c.title}")
        for p in c.slidepacks:
            print(f"  - Pack ID: {p.id}, Title: {p.title}, Status: {p.status}, Path: {p.file_path}")
    db.close()
    
    print("\n--- Storage Content ---")
    storage_path = os.path.join('backend', 'storage')
    if os.path.exists(storage_path):
        for root, dirs, files in os.walk(storage_path):
            level = root.replace(storage_path, '').count(os.sep)
            indent = ' ' * 4 * (level)
            print(f"{indent}{os.path.basename(root)}/")
            subindent = ' ' * 4 * (level + 1)
            for f in files:
                print(f"{subindent}{f}")
    else:
        print("Storage directory not found.")

if __name__ == "__main__":
    check_db_and_storage()
