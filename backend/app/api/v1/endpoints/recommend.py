from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.ml.engine import RecommendationEngine
from app.models.internship import Internship
from app.models.recommendation import Recommendation
from app.models.student import Student
from app.models.user import User, UserRole
from app.schemas.recommendation import (
    ExplanationResult,
    RecommendationResponse,
    RecommendationResult,
)
from app.services.auth_service import get_current_user
from app.services.recommendation_service import (
    clear_recommendations,
    get_saved_recommendations,
    save_recommendations,
)

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


def _authorize_student_access(current_user: User, student: Student) -> None:
    if current_user.role == UserRole.STUDENT and student.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access recommendations for this student",
        )


def _build_response_from_saved(
    student_id: int,
    saved_rows: list[Recommendation],
    top_n: int,
) -> RecommendationResponse:
    recommendations: list[RecommendationResult] = []

    for row in saved_rows[:top_n]:
        internship = row.internship
        if internship is None:
            continue

        recommendations.append(
            RecommendationResult(
                internship_id=row.internship_id,
                title=internship.title,
                company=internship.company,
                content_score=row.content_score,
                collaborative_score=row.collaborative_score,
                affirmative_score=row.affirmative_score,
                final_score=row.final_score,
                explanation=ExplanationResult(
                    matched_skills=list(row.matched_skills or []),
                    missing_skills=list(row.missing_skills or []),
                    content_score=row.content_score,
                ),
            )
        )

    return RecommendationResponse(
        student_id=student_id,
        recommendations=recommendations,
    )


# ------------------------------------------------------------------
# POST /recommend/batch
# ------------------------------------------------------------------

@router.post("/batch")
def run_batch_recommendations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Run recommendations for all students and persist results (admin only)."""
    _require_admin(current_user)

    students = db.query(Student).all()
    if not students:
        return {
            "students_processed": 0,
            "total_recommendations": 0,
        }

    engine = RecommendationEngine(db)
    students_processed = 0
    total_recommendations = 0

    for student in students:
        raw = engine.recommend(student, top_n=5)
        save_recommendations(db, student.id, raw)
        students_processed += 1
        total_recommendations += len(raw)

    return {
        "students_processed": students_processed,
        "total_recommendations": total_recommendations,
    }


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

    student_ids = [
        sid
        for (sid,) in db.query(Recommendation.student_id).distinct().all()
    ]
    for sid in student_ids:
        clear_recommendations(db, sid)

    return {
        "status": "ok",
        "message": "Model retrained successfully",
        "cleared_students": len(student_ids),
    }


# ------------------------------------------------------------------
# GET /recommend/{student_id}
# ------------------------------------------------------------------

@router.get("/{student_id}", response_model=RecommendationResponse)
def get_recommendations(
    student_id: int,
    top_n: int = Query(default=5, ge=1, le=200),
    force: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return top-N internship recommendations for a student.

    Uses persisted recommendations when available and fresh (<=24 hours old),
    otherwise computes new recommendations and persists them.
    If force=True, bypasses cache and recomputes recommendations.
    """
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found",
        )
    _authorize_student_access(current_user, student)

    if force:
        clear_recommendations(db, student_id)

    freshness_cutoff = datetime.utcnow() - timedelta(hours=24)
    saved = get_saved_recommendations(db, student_id)
    saved_is_fresh = bool(saved) and all(
        row.generated_at is not None and row.generated_at >= freshness_cutoff
        for row in saved
    )

    if not force and saved_is_fresh and len(saved) >= top_n:
        return _build_response_from_saved(student_id, saved, top_n)

    engine = RecommendationEngine(db)
    raw = engine.recommend(student, top_n=top_n)
    save_recommendations(db, student_id, raw)

    saved_after = get_saved_recommendations(db, student_id)
    if saved_after:
        return _build_response_from_saved(student_id, saved_after, top_n)

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
    _authorize_student_access(current_user, student)

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
