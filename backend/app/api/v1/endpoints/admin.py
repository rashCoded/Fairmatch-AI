from collections import defaultdict
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, model_validator

from app.db.database import get_db
from app.ml.engine import RecommendationEngine
from app.models.application import Application, ApplicationStatus
from app.models.audit_log import AuditLog
from app.models.internship import Internship
from app.models.recommendation import Recommendation
from app.models.student import Student
from app.models.user import User, UserRole
from app.schemas.application import (
    AdminStudentApplicationResponse,
    ManualAllocationOverrideRequest,
    RecentAllocationResponse,
)
from app.schemas.internship import InternshipCreate, InternshipResponse, InternshipUpdate
from app.schemas.student import StudentProfileResponse
from app.services.auth_service import get_current_user

router = APIRouter(tags=["admin"])


BulkActionType = Literal["under_review", "selected", "rejected"]


class BulkActionRequest(BaseModel):
    action: BulkActionType
    min_score: float = Field(ge=0.0, le=1.0)
    max_score: float = Field(default=1.0, ge=0.0, le=1.0)
    dry_run: bool = True

    @model_validator(mode="after")
    def validate_score_range(self) -> "BulkActionRequest":
        if self.max_score < self.min_score:
            raise ValueError("max_score must be greater than or equal to min_score")
        return self


class AllocateStudentsResponse(BaseModel):
    students_processed: int
    applications_created: int


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _require_admin(current_user: User) -> None:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )


def _compute_scores_for_pair(
    db: Session,
    student: Student,
    internship: Internship,
) -> dict[str, Any]:
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
        pass

    return {
        "content_score": round(content_score, 4),
        "collaborative_score": round(collaborative_score, 4),
        "affirmative_score": round(affirmative_score, 4),
        "final_score": round(final_score, 4),
        "explanation": explanation,
    }


def _normalize_skill_values(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []

    normalized: list[str] = []
    for value in raw:
        text = str(value).strip()
        if text:
            normalized.append(text)
    return normalized


def _extract_match_details(application: Application) -> tuple[list[str], list[str]]:
    breakdown = application.score_breakdown if isinstance(application.score_breakdown, dict) else {}

    explanation_raw = breakdown.get("explanation") if isinstance(breakdown, dict) else {}
    explanation = explanation_raw if isinstance(explanation_raw, dict) else {}

    matched_raw = explanation.get("matched_skills")
    if matched_raw is None:
        matched_raw = breakdown.get("matched_skills")

    missing_raw = explanation.get("missing_skills")
    if missing_raw is None:
        missing_raw = breakdown.get("missing_skills")

    return _normalize_skill_values(matched_raw), _normalize_skill_values(missing_raw)


# ------------------------------------------------------------------
# GET /admin/students — paginated, filterable
# ------------------------------------------------------------------

@router.get("/students", response_model=list[StudentProfileResponse])
def list_students(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
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
    if search is not None and search.strip():
        search_pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Student.full_name.ilike(search_pattern),
                Student.college.ilike(search_pattern),
                Student.district.ilike(search_pattern),
            )
        )
    if has_previous_internship is not None:
        query = query.filter(Student.has_previous_internship == has_previous_internship)

    students = query.offset(skip).limit(limit).all()
    return students


# ------------------------------------------------------------------
# GET /admin/students/{student_id} — full profile
# ------------------------------------------------------------------

@router.get("/students/{student_id}/applications", response_model=list[AdminStudentApplicationResponse])
def get_student_applications(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AdminStudentApplicationResponse]:
    """Return all applications for a specific student (admin only)."""
    _require_admin(current_user)

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found",
        )

    rows = (
        db.query(Application, Internship)
        .join(Internship, Internship.id == Application.internship_id)
        .filter(Application.student_id == student_id)
        .order_by(Application.created_at.desc())
        .all()
    )

    responses: list[AdminStudentApplicationResponse] = []
    for application, internship in rows:
        matched_skills, missing_skills = _extract_match_details(application)

        responses.append(
            AdminStudentApplicationResponse(
                id=application.id,
                student_id=application.student_id,
                student_name=student.full_name,
                student_college=student.college,
                student_branch=student.branch,
                student_graduation_year=student.graduation_year,
                student_cgpa=student.cgpa,
                student_skills=_normalize_skill_values(student.skills or []),
                student_district=student.district,
                student_state=student.state,
                social_category=student.social_category,
                is_rural=bool(student.is_rural),
                has_previous_internship=bool(student.has_previous_internship),
                internship_id=application.internship_id,
                internship_title=internship.title,
                company=internship.company,
                internship_location=internship.location,
                internship_state=internship.state,
                internship_sector=internship.sector,
                internship_duration_months=internship.duration_months,
                internship_stipend=internship.stipend,
                internship_required_skills=_normalize_skill_values(internship.required_skills or []),
                internship_total_seats=internship.total_seats,
                internship_filled_seats=internship.filled_seats,
                internship_available_seats=max(0, internship.total_seats - internship.filled_seats),
                status=application.status,
                content_score=application.content_score,
                collaborative_score=application.collaborative_score,
                affirmative_score=application.affirmative_score,
                final_score=application.final_score,
                matched_skills=matched_skills,
                missing_skills=missing_skills,
                applied_at=application.created_at,
            )
        )

    return responses

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

    data = payload.model_dump()
    if data["filled_seats"] > data["total_seats"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="filled_seats cannot exceed total_seats",
        )

    internship = Internship(**data)
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

    new_total_seats = update_data.get("total_seats", internship.total_seats)
    new_filled_seats = update_data.get("filled_seats", internship.filled_seats)
    if new_filled_seats > new_total_seats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="filled_seats cannot exceed total_seats",
        )

    for field, value in update_data.items():
        setattr(internship, field, value)

    db.commit()
    db.refresh(internship)
    return internship


# ------------------------------------------------------------------
# GET /admin/analytics — dashboard statistics
# ------------------------------------------------------------------

@router.get("/allocations", response_model=list[RecentAllocationResponse])
def get_recent_allocations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[RecentAllocationResponse]:
    """Return recent allocations/applications (admin only)."""
    _require_admin(current_user)

    rows = (
        db.query(Application, Student, Internship)
        .join(Student, Student.id == Application.student_id)
        .join(Internship, Internship.id == Application.internship_id)
        .order_by(Application.created_at.desc())
        .limit(20)
        .all()
    )

    allocations: list[RecentAllocationResponse] = []
    for application, student, internship in rows:
        matched_skills, missing_skills = _extract_match_details(application)

        allocations.append(
            RecentAllocationResponse(
                id=application.id,
                student_id=student.id,
                student_name=student.full_name,
                student_college=student.college,
                student_branch=student.branch,
                student_graduation_year=student.graduation_year,
                student_cgpa=student.cgpa,
                student_skills=_normalize_skill_values(student.skills or []),
                student_district=student.district,
                student_state=student.state,
                social_category=student.social_category,
                is_rural=bool(student.is_rural),
                has_previous_internship=bool(student.has_previous_internship),
                internship_id=internship.id,
                internship_title=internship.title,
                company=internship.company,
                internship_location=internship.location,
                internship_state=internship.state,
                internship_sector=internship.sector,
                internship_duration_months=internship.duration_months,
                internship_stipend=internship.stipend,
                internship_required_skills=_normalize_skill_values(internship.required_skills or []),
                internship_total_seats=internship.total_seats,
                internship_filled_seats=internship.filled_seats,
                internship_available_seats=max(0, internship.total_seats - internship.filled_seats),
                status=application.status,
                content_score=application.content_score,
                collaborative_score=application.collaborative_score,
                affirmative_score=application.affirmative_score,
                final_score=application.final_score,
                matched_skills=matched_skills,
                missing_skills=missing_skills,
                applied_at=application.created_at,
            )
        )

    return allocations


@router.post(
    "/allocations/override",
    response_model=AdminStudentApplicationResponse,
    status_code=status.HTTP_201_CREATED,
)
def manual_override_allocation(
    payload: ManualAllocationOverrideRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AdminStudentApplicationResponse:
    """Manually allocate a student to an internship (admin only)."""
    _require_admin(current_user)

    student = db.query(Student).filter(Student.id == payload.student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found",
        )

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
            Application.student_id == payload.student_id,
            Application.internship_id == payload.internship_id,
        )
        .first()
    )

    if not existing and internship.filled_seats >= internship.total_seats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This internship has no available seats",
        )

    if existing:
        previous_status = existing.status.value
        existing.status = ApplicationStatus.PENDING
        if previous_status == ApplicationStatus.SELECTED.value and internship.filled_seats > 0:
            internship.filled_seats -= 1
            db.add(internship)
        application = existing
        action = "manual_override_reopen"
        details = {
            "student_id": student.id,
            "internship_id": internship.id,
            "previous_status": previous_status,
            "new_status": ApplicationStatus.PENDING.value,
            "seat_released": previous_status == ApplicationStatus.SELECTED.value,
        }
    else:
        scores = _compute_scores_for_pair(db, student, internship)
        application = Application(
            student_id=student.id,
            internship_id=internship.id,
            status=ApplicationStatus.PENDING,
            content_score=scores["content_score"],
            collaborative_score=scores["collaborative_score"],
            affirmative_score=scores["affirmative_score"],
            final_score=scores["final_score"],
            score_breakdown={
                "content_score": scores["content_score"],
                "collaborative_score": scores["collaborative_score"],
                "affirmative_score": scores["affirmative_score"],
                "final_score": scores["final_score"],
                "explanation": scores["explanation"],
            },
        )
        db.add(application)
        db.flush()

        action = "manual_override_allocate"
        details = {
            "student_id": student.id,
            "internship_id": internship.id,
            "final_score": application.final_score,
            "content_score": application.content_score,
            "collaborative_score": application.collaborative_score,
            "affirmative_score": application.affirmative_score,
        }

    audit = AuditLog(
        action=action,
        entity_type="application",
        entity_id=application.id,
        performed_by=current_user.id,
        details=details,
    )

    db.add(application)
    db.add(audit)
    db.commit()
    db.refresh(application)

    matched_skills, missing_skills = _extract_match_details(application)

    return AdminStudentApplicationResponse(
        id=application.id,
        student_id=application.student_id,
        student_name=student.full_name,
        student_college=student.college,
        student_branch=student.branch,
        student_graduation_year=student.graduation_year,
        student_cgpa=student.cgpa,
        student_skills=_normalize_skill_values(student.skills or []),
        student_district=student.district,
        student_state=student.state,
        social_category=student.social_category,
        is_rural=bool(student.is_rural),
        has_previous_internship=bool(student.has_previous_internship),
        internship_id=application.internship_id,
        internship_title=internship.title,
        company=internship.company,
        internship_location=internship.location,
        internship_state=internship.state,
        internship_sector=internship.sector,
        internship_duration_months=internship.duration_months,
        internship_stipend=internship.stipend,
        internship_required_skills=_normalize_skill_values(internship.required_skills or []),
        internship_total_seats=internship.total_seats,
        internship_filled_seats=internship.filled_seats,
        internship_available_seats=max(0, internship.total_seats - internship.filled_seats),
        status=application.status,
        content_score=application.content_score,
        collaborative_score=application.collaborative_score,
        affirmative_score=application.affirmative_score,
        final_score=application.final_score,
        matched_skills=matched_skills,
        missing_skills=missing_skills,
        applied_at=application.created_at,
    )

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

    district_rows = (
        db.query(Student.district, func.count(Student.id))
        .filter(Student.district.isnot(None), Student.district != "")
        .group_by(Student.district)
        .order_by(func.count(Student.id).desc())
        .all()
    )
    district_distribution: dict[str, int] = {
        district: count
        for district, count in district_rows
        if district
    }
    district_coverage_count = len(district_distribution)

    selected_district_coverage_count = (
        db.query(func.count(func.distinct(Student.district)))
        .join(Application, Application.student_id == Student.id)
        .filter(
            Application.status == ApplicationStatus.SELECTED,
            Student.district.isnot(None),
            Student.district != "",
        )
        .scalar()
    ) or 0

    active_internships = (
        db.query(Internship.total_seats, Internship.filled_seats)
        .filter(Internship.is_active.is_(True))
        .all()
    )
    total_seats = sum(row.total_seats for row in active_internships)
    filled_seats = sum(row.filled_seats for row in active_internships)
    capacity_utilization_rate = round(filled_seats / total_seats, 4) if total_seats > 0 else 0.0
    internships_near_capacity = sum(
        1
        for row in active_internships
        if row.total_seats > 0 and (row.filled_seats / row.total_seats) >= 0.8
    )

    return {
        "total_students": total_students,
        "total_internships": total_internships,
        "total_applications": total_applications,
        "applications_by_status": applications_by_status,
        "students_by_category": students_by_category,
        "rural_student_count": rural_student_count,
        "placement_rate": placement_rate,
        "district_distribution": district_distribution,
        "district_coverage_count": district_coverage_count,
        "selected_district_coverage_count": selected_district_coverage_count,
        "capacity_utilization_rate": capacity_utilization_rate,
        "internships_near_capacity": internships_near_capacity,
    }


# ------------------------------------------------------------------
# POST /admin/bulk-action — threshold based status updates
# ------------------------------------------------------------------

@router.post("/bulk-action")
def bulk_action(
    payload: BulkActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Bulk-update applications by score thresholds (admin only)."""
    _require_admin(current_user)

    eligible_statuses = (
        [ApplicationStatus.PENDING]
        if payload.action == "under_review"
        else [ApplicationStatus.PENDING, ApplicationStatus.UNDER_REVIEW]
    )

    candidate_rows: list[tuple[Application, Student, Internship]] = (
        db.query(Application, Student, Internship)
        .join(Student, Student.id == Application.student_id)
        .join(Internship, Internship.id == Application.internship_id)
        .filter(Application.status.in_(eligible_statuses))
        .filter(
            Application.final_score >= payload.min_score,
            Application.final_score <= payload.max_score,
        )
        .order_by(Application.final_score.desc(), Application.created_at.asc())
        .all()
    )

    seat_limit_applied = payload.action == "selected"
    skipped_due_to_seats = 0
    selected_counts: dict[int, int] = {}
    targeted_rows: list[tuple[Application, Student, Internship]] = []

    if payload.action == "selected":
        grouped_candidates: dict[int, list[tuple[Application, Student, Internship]]] = defaultdict(list)
        for row in candidate_rows:
            grouped_candidates[row[2].id].append(row)

        internship_ids = list(grouped_candidates.keys())
        if internship_ids:
            selected_counts = {
                internship_id: count
                for internship_id, count in (
                    db.query(Application.internship_id, func.count(Application.id))
                    .filter(
                        Application.internship_id.in_(internship_ids),
                        Application.status == ApplicationStatus.SELECTED,
                    )
                    .group_by(Application.internship_id)
                    .all()
                )
            }

        for internship_id, rows in grouped_candidates.items():
            internship = rows[0][2]
            current_selected = selected_counts.get(internship_id, 0)
            occupied_seats = max(internship.filled_seats, current_selected)
            available_seats = max(0, internship.total_seats - occupied_seats)

            sorted_rows = sorted(
                rows,
                key=lambda row: (
                    -(row[0].final_score or 0.0),
                    row[0].created_at,
                ),
            )

            if available_seats <= 0:
                skipped_due_to_seats += len(sorted_rows)
                continue

            picked_rows = sorted_rows[:available_seats]
            targeted_rows.extend(picked_rows)
            skipped_due_to_seats += max(0, len(sorted_rows) - len(picked_rows))
    else:
        targeted_rows = list(candidate_rows)

    internships_affected = len({internship.id for _, _, internship in targeted_rows})
    students_affected = len({student.id for _, student, _ in targeted_rows})

    preview_sample = [
        {
            "application_id": application.id,
            "applicationId": application.id,
            "student_id": student.id,
            "studentId": student.id,
            "student_name": student.full_name,
            "internship_title": internship.title,
            "company": internship.company,
            "final_score": round(float(application.final_score or 0.0), 4),
            "current_status": application.status.value,
        }
        for application, student, internship in targeted_rows[:10]
    ]

    if payload.dry_run:
        return {
            "dry_run": True,
            "action": payload.action,
            "applications_affected": len(targeted_rows),
            "internships_affected": internships_affected,
            "students_affected": students_affected,
            "seat_limit_applied": seat_limit_applied,
            "skipped_due_to_seats": skipped_due_to_seats,
            "score_range": {
                "min": payload.min_score,
                "max": payload.max_score,
            },
            "preview_sample": preview_sample,
        }

    next_status = {
        "under_review": ApplicationStatus.UNDER_REVIEW,
        "selected": ApplicationStatus.SELECTED,
        "rejected": ApplicationStatus.REJECTED,
    }[payload.action]

    affected_count = len(targeted_rows)
    if affected_count == 0:
        return {
            "dry_run": False,
            "action": payload.action,
            "applications_updated": 0,
            "internships_affected": 0,
            "skipped_due_to_seats": skipped_due_to_seats,
            "message": "Bulk action completed successfully",
        }

    selected_increments: dict[int, int] = defaultdict(int)
    internship_map: dict[int, Internship] = {}

    for application, student, internship in targeted_rows:
        previous_status = application.status.value
        application.status = next_status
        db.add(application)

        if payload.action == "selected":
            selected_increments[internship.id] += 1
            internship_map[internship.id] = internship

        audit = AuditLog(
            action="bulk_action",
            entity_type="application",
            entity_id=application.id,
            performed_by=current_user.id,
            details={
                "action": payload.action,
                "min_score": payload.min_score,
                "max_score": payload.max_score,
                "affected_count": affected_count,
                "previous_status": previous_status,
                "new_status": next_status.value,
                "student_id": student.id,
                "internship_id": internship.id,
                "final_score": round(float(application.final_score or 0.0), 4),
            },
        )
        db.add(audit)

    if payload.action == "selected":
        for internship_id, increment in selected_increments.items():
            internship = internship_map[internship_id]
            current_selected = selected_counts.get(internship_id, 0)
            baseline_filled = max(internship.filled_seats, current_selected)
            internship.filled_seats = min(internship.total_seats, baseline_filled + increment)
            db.add(internship)

    db.commit()

    return {
        "dry_run": False,
        "action": payload.action,
        "applications_updated": affected_count,
        "internships_affected": internships_affected,
        "skipped_due_to_seats": skipped_due_to_seats,
        "message": "Bulk action completed successfully",
    }


# ------------------------------------------------------------------
# POST /admin/demo-reset — clear demo allocation state
# ------------------------------------------------------------------

@router.post("/demo-reset")
def demo_reset(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Clear non-final applications and recommendations for demo reset (admin only)."""
    _require_admin(current_user)

    applications_preserved = (
        db.query(func.count(Application.id))
        .filter(Application.status.in_([ApplicationStatus.SELECTED, ApplicationStatus.REJECTED]))
        .scalar()
        or 0
    )

    applications_cleared = (
        db.query(Application)
        .filter(Application.status.in_([ApplicationStatus.PENDING, ApplicationStatus.UNDER_REVIEW]))
        .delete(synchronize_session=False)
    )
    recommendations_cleared = db.query(Recommendation).delete(synchronize_session=False)
    db.commit()

    return {
        "applications_cleared": applications_cleared,
        "applications_preserved": applications_preserved,
        "recommendations_cleared": recommendations_cleared,
        "message": "Demo reset complete. Confirmed placements preserved. Ready for bulk allocation.",
    }


# ------------------------------------------------------------------
# POST /admin/allocate — bulk match unmatched students
# ------------------------------------------------------------------

@router.post("/allocate", response_model=AllocateStudentsResponse)
def allocate_students(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AllocateStudentsResponse:
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
