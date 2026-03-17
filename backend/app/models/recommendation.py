from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, UniqueConstraint, text
from sqlalchemy.orm import relationship
from sqlalchemy.types import ARRAY

from app.db.database import Base


class Recommendation(Base):
    __tablename__ = "recommendations"
    __table_args__ = (
        UniqueConstraint(
            "student_id",
            "internship_id",
            name="uq_recommendations_student_internship",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    internship_id = Column(Integer, ForeignKey("internships.id"), nullable=False, index=True)

    content_score = Column(Float, default=0.0)
    collaborative_score = Column(Float, default=0.0)
    affirmative_score = Column(Float, default=0.0)
    final_score = Column(Float, default=0.0)

    matched_skills = Column(ARRAY(String), default=list)
    missing_skills = Column(ARRAY(String), default=list)
    score_breakdown = Column(JSON, default=dict)

    generated_at = Column(DateTime, nullable=False, server_default=text("now()"))
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"))

    student = relationship("Student", back_populates="recommendations")
    internship = relationship("Internship", back_populates="recommendations")