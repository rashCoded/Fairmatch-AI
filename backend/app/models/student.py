from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.types import ARRAY
from app.db.database import Base

class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    
    full_name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    college = Column(String, nullable=True)
    degree = Column(String, nullable=True)
    branch = Column(String, nullable=True)
    graduation_year = Column(Integer, nullable=True)
    cgpa = Column(Float, nullable=True)
    
    # Skills stored as array of strings. 
    # Note: Requires PostgreSQL or a DB that supports ARRAY types.
    skills = Column(ARRAY(String), default=list)
    
    district = Column(String, nullable=True)
    state = Column(String, nullable=True)
    is_rural = Column(Boolean, default=False)
    social_category = Column(String, nullable=True) # GEN, OBC, SC, ST
    has_previous_internship = Column(Boolean, default=False)
    
    resume_path = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="student")
    applications = relationship("Application", back_populates="student")
    recommendations = relationship("Recommendation", back_populates="student")
