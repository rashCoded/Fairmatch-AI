from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.ml.engine import RecommendationEngine
from app.models.internship import Internship
from app.models.student import Student
from app.models.user import User, UserRole
from app.schemas.recommendation import (
    ExplanationResult,
    RecommendationResponse,
    RecommendationResult,
)
from app.services.auth_service import get_current_user

router = APIRouter(tags=["recommend"])


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _require_admin(current_user: User) -> None:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )


# ------------------------------------------------------------------
# GET /recommend/{student_id}
# ------------------------------------------------------------------

@router.get("/{student_id}", response_model=RecommendationResponse)
def get_recommendations(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return top-5 internship recommendations for a student."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found",
        )

    engine = RecommendationEngine(db)
    raw = engine.recommend(student, top_n=5)

    recommendations = [
        RecommendationResult(
            internship_id=r["internship_id"],
            title=r["title"],
            company=r["company"],
            content_score=r["content_score"],
            collaborative_score=r["collaborative_score"],
            affirmative_score=r["affirmative_score"],
            final_score=r["final_score"],
            explanation=ExplanationResult(**r["explanation"]),
        )
        for r in raw
    ]

    return RecommendationResponse(
        student_id=student_id,
        recommendations=recommendations,
    )


# ------------------------------------------------------------------
# GET /recommend/{student_id}/explain/{internship_id}
# ------------------------------------------------------------------

@router.get("/{student_id}/explain/{internship_id}", response_model=ExplanationResult)
def explain_recommendation(
    student_id: int,
    internship_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Detailed explanation for one student-internship pair."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found",
        )

    internship = db.query(Internship).filter(Internship.id == internship_id).first()
    if not internship:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Internship not found",
        )

    engine = RecommendationEngine(db)
    skills = list(student.skills) if student.skills else []
    explanation = engine.content_filter.explain(skills, internship_id)

    return ExplanationResult(
        matched_skills=explanation["matched_skills"],
        missing_skills=explanation["missing_skills"],
        content_score=round(explanation["content_score"], 4),
    )


# ------------------------------------------------------------------
# POST /recommend/retrain
# ------------------------------------------------------------------

@router.post("/retrain")
def retrain_model(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Force-retrain the recommendation engine from current DB data (admin only)."""
    _require_admin(current_user)

    engine = RecommendationEngine(db)
    engine.retrain(db)

    return {"status": "ok", "message": "Model retrained successfully"}
