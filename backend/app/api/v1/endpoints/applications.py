from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.ml.engine import RecommendationEngine
from app.models.application import Application, ApplicationStatus
from app.models.audit_log import AuditLog
from app.models.internship import Internship
from app.models.student import Student
from app.models.user import User, UserRole
from app.schemas.application import (
    ApplicationApplyRequest,
    ApplicationResponse,
    ApplicationStatusEnum,
    ApplicationStatusUpdate,
)
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/applications", tags=["applications"])


ALLOWED_STATUS_TRANSITIONS: dict[ApplicationStatus, set[ApplicationStatus]] = {
    ApplicationStatus.PENDING: {
        ApplicationStatus.UNDER_REVIEW,
        ApplicationStatus.REJECTED,
    },
    ApplicationStatus.UNDER_REVIEW: {
        ApplicationStatus.SELECTED,
        ApplicationStatus.REJECTED,
    },
    ApplicationStatus.SELECTED: set(),
    ApplicationStatus.REJECTED: {
        ApplicationStatus.UNDER_REVIEW,
    },
}


def _require_student(current_user: User) -> None:
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student role required",
        )


def _require_admin(current_user: User) -> None:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )


def _get_student_profile(db: Session, current_user: User) -> Student:
    student = db.query(Student).filter(Student.user_id == current_user.id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student profile not found",
        )
    return student


@router.post("", response_model=ApplicationResponse, status_code=status.HTTP_201_CREATED)
def create_application(
    payload: ApplicationApplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Apply to a specific internship as the current student."""
    _require_student(current_user)
    student = _get_student_profile(db, current_user)

    internship = db.query(Internship).filter(Internship.id == payload.internship_id).first()
    if not internship:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Internship not found",
        )

    if not internship.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Internship is not active",
        )

    existing = (
        db.query(Application)
        .filter(
            Application.student_id == student.id,
            Application.internship_id == internship.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already applied to this internship",
        )

    if internship.filled_seats >= internship.total_seats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This internship has no available seats",
        )

    content_score = 0.0
    collaborative_score = 0.0
    affirmative_score = 0.0
    final_score = 0.0
    explanation: dict[str, Any] = {
        "matched_skills": [],
        "missing_skills": [],
        "content_score": 0.0,
    }

    try:
        engine = RecommendationEngine(db)
        recommendations = engine.recommend(student, top_n=200)

        matched = next(
            (item for item in recommendations if item["internship_id"] == internship.id),
            None,
        )

        if matched:
            content_score = float(matched.get("content_score", 0.0))
            collaborative_score = float(matched.get("collaborative_score", 0.0))
            affirmative_score = float(matched.get("affirmative_score", 0.0))
            final_score = float(matched.get("final_score", 0.0))
            explanation = matched.get("explanation", explanation)
        else:
            skills = list(student.skills) if student.skills else []
            generated = engine.content_filter.explain(skills, internship.id)
            content_score = float(generated.get("content_score", 0.0))
            final_score = content_score
            explanation = {
                "matched_skills": generated.get("matched_skills", []),
                "missing_skills": generated.get("missing_skills", []),
                "content_score": content_score,
            }
    except Exception:
        # Recommendation scoring should not block application creation.
        pass

    application = Application(
        student_id=student.id,
        internship_id=internship.id,
        status=ApplicationStatus.PENDING,
        content_score=round(content_score, 4),
        collaborative_score=round(collaborative_score, 4),
        affirmative_score=round(affirmative_score, 4),
        final_score=round(final_score, 4),
        score_breakdown={
            "content_score": round(content_score, 4),
            "collaborative_score": round(collaborative_score, 4),
            "affirmative_score": round(affirmative_score, 4),
            "final_score": round(final_score, 4),
            "explanation": explanation,
        },
    )

    db.add(application)
    db.commit()
    db.refresh(application)

    return application


@router.get("/my", response_model=list[ApplicationResponse])
def list_my_applications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Return all applications for the currently authenticated student."""
    _require_student(current_user)
    student = _get_student_profile(db, current_user)

    applications = (
        db.query(Application)
        .filter(Application.student_id == student.id)
        .order_by(Application.created_at.desc())
        .all()
    )

    return applications


@router.put("/{application_id}/status", response_model=ApplicationResponse)
def update_application_status(
    application_id: int,
    payload: ApplicationStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Update application status as admin."""
    _require_admin(current_user)

    application = db.query(Application).filter(Application.id == application_id).first()
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found",
        )

    internship = db.query(Internship).filter(Internship.id == application.internship_id).first()
    if not internship:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Internship not found",
        )

    current_status = application.status
    next_status = ApplicationStatus(payload.status.value)
    allowed_next_statuses = ALLOWED_STATUS_TRANSITIONS.get(current_status, set())

    if next_status not in allowed_next_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status transition from {current_status.value} to {next_status.value}",
        )

    if next_status == ApplicationStatus.SELECTED:
        if internship.filled_seats >= internship.total_seats:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This internship has no available seats",
            )
        internship.filled_seats += 1
        db.add(internship)

    previous_status = current_status.value
    application.status = next_status

    audit = AuditLog(
        action="application_status_update",
        entity_type="application",
        entity_id=application.id,
        performed_by=current_user.id,
        details={
            "from_status": previous_status,
            "to_status": payload.status.value,
            "student_id": application.student_id,
            "internship_id": application.internship_id,
        },
    )

    db.add(application)
    db.add(audit)
    db.commit()
    db.refresh(application)

    return application
