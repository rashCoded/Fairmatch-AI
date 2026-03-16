from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.ml.engine import RecommendationEngine
from app.models.application import Application, ApplicationStatus
from app.models.audit_log import AuditLog
from app.models.internship import Internship
from app.models.student import Student
from app.models.user import User, UserRole
from app.schemas.internship import InternshipCreate, InternshipResponse, InternshipUpdate
from app.schemas.student import StudentProfileResponse
from app.services.auth_service import get_current_user

router = APIRouter(tags=["admin"])


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
# GET /admin/students — paginated, filterable
# ------------------------------------------------------------------

@router.get("/students", response_model=list[StudentProfileResponse])
def list_students(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    social_category: str | None = Query(None),
    is_rural: bool | None = Query(None),
    district: str | None = Query(None),
    has_previous_internship: bool | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """List students with optional filters (admin only)."""
    _require_admin(current_user)

    query = db.query(Student)

    if social_category is not None:
        query = query.filter(Student.social_category == social_category.upper())
    if is_rural is not None:
        query = query.filter(Student.is_rural == is_rural)
    if district is not None:
        query = query.filter(Student.district.ilike(f"%{district}%"))
    if has_previous_internship is not None:
        query = query.filter(Student.has_previous_internship == has_previous_internship)

    students = query.offset(skip).limit(limit).all()
    return students


# ------------------------------------------------------------------
# GET /admin/students/{student_id} — full profile
# ------------------------------------------------------------------

@router.get("/students/{student_id}", response_model=StudentProfileResponse)
def get_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Full student profile (admin only)."""
    _require_admin(current_user)

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found",
        )
    return student


# ------------------------------------------------------------------
# GET /admin/internships — list all (including inactive)
# ------------------------------------------------------------------

@router.get("/internships", response_model=list[InternshipResponse])
def list_internships(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """List all internships including inactive (admin only)."""
    _require_admin(current_user)

    internships = db.query(Internship).offset(skip).limit(limit).all()
    return internships


# ------------------------------------------------------------------
# POST /admin/internships — create new internship
# ------------------------------------------------------------------

@router.post("/internships", response_model=InternshipResponse, status_code=status.HTTP_201_CREATED)
def create_internship(
    payload: InternshipCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Create a new internship (admin only)."""
    _require_admin(current_user)

    internship = Internship(**payload.model_dump())
    db.add(internship)
    db.commit()
    db.refresh(internship)
    return internship


# ------------------------------------------------------------------
# PUT /admin/internships/{internship_id} — update internship
# ------------------------------------------------------------------

@router.put("/internships/{internship_id}", response_model=InternshipResponse)
def update_internship(
    internship_id: int,
    payload: InternshipUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Update an existing internship (admin only)."""
    _require_admin(current_user)

    internship = db.query(Internship).filter(Internship.id == internship_id).first()
    if not internship:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Internship not found",
        )

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(internship, field, value)

    db.commit()
    db.refresh(internship)
    return internship


# ------------------------------------------------------------------
# GET /admin/analytics — dashboard statistics
# ------------------------------------------------------------------

@router.get("/analytics")
def get_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return dashboard analytics (admin only)."""
    _require_admin(current_user)

    total_students = db.query(func.count(Student.id)).scalar()
    total_internships = db.query(func.count(Internship.id)).scalar()
    total_applications = db.query(func.count(Application.id)).scalar()

    # Applications grouped by status
    status_rows = (
        db.query(Application.status, func.count(Application.id))
        .group_by(Application.status)
        .all()
    )
    applications_by_status: dict[str, int] = {
        row[0].value: row[1] for row in status_rows
    }

    # Students grouped by social category
    category_rows = (
        db.query(Student.social_category, func.count(Student.id))
        .group_by(Student.social_category)
        .all()
    )
    students_by_category: dict[str, int] = {
        (row[0] or "UNKNOWN"): row[1] for row in category_rows
    }

    # Rural student count
    rural_student_count = (
        db.query(func.count(Student.id))
        .filter(Student.is_rural == True)  # noqa: E712
        .scalar()
    )

    # Placement rate = selected / total applications
    selected_count = (
        db.query(func.count(Application.id))
        .filter(Application.status == ApplicationStatus.SELECTED)
        .scalar()
    )
    placement_rate = 0.0
    if total_applications > 0:
        placement_rate = round(selected_count / total_applications, 4)

    return {
        "total_students": total_students,
        "total_internships": total_internships,
        "total_applications": total_applications,
        "applications_by_status": applications_by_status,
        "students_by_category": students_by_category,
        "rural_student_count": rural_student_count,
        "placement_rate": placement_rate,
    }


# ------------------------------------------------------------------
# POST /admin/allocate — bulk match unmatched students
# ------------------------------------------------------------------

@router.post("/allocate")
def allocate_students(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Run recommendation engine for all unmatched students.

    For each student who has zero applications, generates top-3
    recommendations and creates Application records with status=pending.
    Each allocation is logged in the AuditLog table.
    """
    _require_admin(current_user)

    # Find students who have NO applications at all
    students_with_apps = (
        db.query(Application.student_id).distinct().subquery()
    )
    unmatched_students = (
        db.query(Student)
        .filter(Student.id.notin_(db.query(students_with_apps.c.student_id)))
        .all()
    )

    if not unmatched_students:
        return {"students_processed": 0, "applications_created": 0}

    engine = RecommendationEngine(db)

    students_processed = 0
    applications_created = 0

    for student in unmatched_students:
        recommendations = engine.recommend(student, top_n=3)

        for rec in recommendations:
            application = Application(
                student_id=student.id,
                internship_id=rec["internship_id"],
                status=ApplicationStatus.PENDING,
                content_score=rec["content_score"],
                collaborative_score=rec["collaborative_score"],
                affirmative_score=rec["affirmative_score"],
                final_score=rec["final_score"],
                score_breakdown={
                    "content_score": rec["content_score"],
                    "collaborative_score": rec["collaborative_score"],
                    "affirmative_score": rec["affirmative_score"],
                    "final_score": rec["final_score"],
                    "explanation": rec["explanation"],
                },
            )
            db.add(application)
            applications_created += 1

            # Audit log entry
            audit = AuditLog(
                action="auto_allocate",
                entity_type="application",
                entity_id=None,
                performed_by=current_user.id,
                details={
                    "student_id": student.id,
                    "internship_id": rec["internship_id"],
                    "final_score": rec["final_score"],
                    "content_score": rec["content_score"],
                    "collaborative_score": rec["collaborative_score"],
                    "affirmative_score": rec["affirmative_score"],
                },
            )
            db.add(audit)

        students_processed += 1

    db.commit()

    return {
        "students_processed": students_processed,
        "applications_created": applications_created,
    }
