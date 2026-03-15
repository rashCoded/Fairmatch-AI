from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, Float, Text, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.types import ARRAY
from app.db.database import Base

class Internship(Base):
    __tablename__ = "internships"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    company = Column(String, nullable=False)
    sector = Column(String, nullable=False)
    location = Column(String, nullable=False)
    state = Column(String, nullable=False)
    
    required_skills = Column(ARRAY(String), default=list)
    description = Column(Text, nullable=True)
    
    duration_months = Column(Integer, default=3)
    stipend = Column(Float, default=0.0)
    
    total_seats = Column(Integer, default=1)
    filled_seats = Column(Integer, default=0)
    
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    applications = relationship("Application", back_populates="internship")

    @property
    def available_seats(self):
        return max(0, self.total_seats - self.filled_seats)

    @property
    def capacity_ratio(self):
        if self.total_seats == 0:
            return 1.0
        return self.filled_seats / self.total_seats
