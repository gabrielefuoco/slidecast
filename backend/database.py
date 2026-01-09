from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import sessionmaker, relationship, declarative_base
from datetime import datetime

Base = declarative_base()

class Course(Base):
    __tablename__ = 'courses'
    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationship with SlidePacks
    slidepacks = relationship("SlidePack", back_populates="course")

class SlidePack(Base):
    __tablename__ = 'slidepacks'
    id = Column(Integer, primary_key=True)
    title = Column(String) # e.g. "Lecture 1: The Lombards"
    file_path = Column(String) # Path to the JSON/Assets folder
    status = Column(String) # "processing", "completed", "failed"
    created_at = Column(DateTime, default=datetime.utcnow)
    order_index = Column(Integer, default=0)
    
    # Foreign Key to associate with a course
    course_id = Column(Integer, ForeignKey('courses.id'), nullable=True)
    course = relationship("Course", back_populates="slidepacks")

import os

# Setup DB
# We'll use a local sqlite file in the backend directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "slidecast.db")

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)
