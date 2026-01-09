import sys
import os
import requests
import time

# Add backend to sys.path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from backend.database import SessionLocal, Course, SlidePack, init_db

def run_test():
    db = SessionLocal()
    try:
        # 1. Setup Data
        print("Setting up test data...")
        course = Course(title="Reorder Test Course")
        db.add(course)
        db.commit()
        db.refresh(course)
        
        pack1 = SlidePack(title="Pack 1", status="completed", course_id=course.id, order_index=0)
        pack2 = SlidePack(title="Pack 2", status="completed", course_id=course.id, order_index=1)
        db.add(pack1)
        db.add(pack2)
        db.commit()
        db.refresh(pack1)
        db.refresh(pack2)
        
        print(f"Created Course {course.id} with Packs {pack1.id}, {pack2.id}")
        
        # 2. Call Reorder API (Swap)
        url = f"http://localhost:8000/courses/{course.id}/reorder"
        payload = {"pack_ids": [pack2.id, pack1.id]}
        
        print(f"Calling API: {url} with {payload}")
        resp = requests.post(url, json=payload)
        
        if resp.status_code != 200:
            print(f"API Failed: {resp.text}")
            return
            
        print("API Success.")
        
        # 3. Verify DB
        db.expire_all() # Clear cache
        p1 = db.query(SlidePack).filter(SlidePack.id == pack1.id).first()
        p2 = db.query(SlidePack).filter(SlidePack.id == pack2.id).first()
        
        print(f"Pack 1 Index: {p1.order_index} (Expected 1)")
        print(f"Pack 2 Index: {p2.order_index} (Expected 0)")
        
        if p1.order_index == 1 and p2.order_index == 0:
            print("TEST PASSED: Order updated correctly.")
        else:
            print("TEST FAILED: Order not updated.")
            
    finally:
        # Cleanup
        # db.delete(course) # Cascades? Maybe manually delete packs first
        # packs = db.query(SlidePack).filter(SlidePack.course_id == course.id).all()
        # for p in packs: db.delete(p)
        # db.delete(course)
        # db.commit()
        db.close()

if __name__ == "__main__":
    run_test()
