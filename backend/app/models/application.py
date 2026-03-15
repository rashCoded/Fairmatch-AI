import enum
from datetime import datetime
from sqlalchemy import Column, Integer, Float, ForeignKey, DateTime, Enum, JSON
from sqlalchemy.orm import relationship
from app.db.database import Base

class ApplicationStatus(str, enum.Enum):
    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    SELECTED = "selected"
    REJECTED = "rejected"

class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    internship_id = Column(Integer, ForeignKey("internships.id"), nullable=False)
    
    status = Column(Enum(ApplicationStatus), default=ApplicationStatus.PENDING)
    
    # Recommendation Scores at time of application (snapshot for analysis)
    content_score = Column(Float, default=0.0)
    collaborative_score = Column(Float, default=0.0)
    affirmative_score = Column(Float, default=0.0)
    final_score = Column(Float, default=0.0)
    
    # Full explainability payload
    score_breakdown = Column(JSON, default=dict)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    student = relationship("Student", back_populates="applications")
    internship = relationship("Internship", back_populates="applications")
