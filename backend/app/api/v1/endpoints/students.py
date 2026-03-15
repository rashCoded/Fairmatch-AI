from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.student import Student
from app.models.user import User, UserRole
from app.schemas.student import (
	StudentProfileCreate,
	StudentProfileResponse,
	StudentProfileUpdate,
)
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/students", tags=["students"])


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


@router.post(
	"/profile",
	response_model=StudentProfileResponse,
	status_code=status.HTTP_201_CREATED,
)
def create_profile(
	payload: StudentProfileCreate,
	db: Session = Depends(get_db),
	current_user: User = Depends(get_current_user),
) -> StudentProfileResponse:
	_require_student(current_user)

	existing_profile = db.query(Student).filter(Student.user_id == current_user.id).first()
	if existing_profile:
		raise HTTPException(status_code=400, detail="Student profile already exists")

	data = payload.model_dump()
	if data.get("social_category") is not None:
		data["social_category"] = data["social_category"].value

	student = Student(user_id=current_user.id, **data)
	db.add(student)
	db.commit()
	db.refresh(student)
	return StudentProfileResponse.model_validate(student)


@router.get("/profile", response_model=StudentProfileResponse)
def get_own_profile(
	db: Session = Depends(get_db),
	current_user: User = Depends(get_current_user),
) -> StudentProfileResponse:
	_require_student(current_user)

	student = db.query(Student).filter(Student.user_id == current_user.id).first()
	if not student:
		raise HTTPException(status_code=404, detail="Student profile not found")

	return StudentProfileResponse.model_validate(student)


@router.put("/profile", response_model=StudentProfileResponse)
def update_own_profile(
	payload: StudentProfileUpdate,
	db: Session = Depends(get_db),
	current_user: User = Depends(get_current_user),
) -> StudentProfileResponse:
	_require_student(current_user)

	student = db.query(Student).filter(Student.user_id == current_user.id).first()
	if not student:
		raise HTTPException(status_code=404, detail="Student profile not found")

	update_data = payload.model_dump(exclude_unset=True)
	if "social_category" in update_data and update_data["social_category"] is not None:
		update_data["social_category"] = update_data["social_category"].value

	for field, value in update_data.items():
		setattr(student, field, value)

	db.add(student)
	db.commit()
	db.refresh(student)
	return StudentProfileResponse.model_validate(student)


@router.get("/{id}", response_model=StudentProfileResponse)
def get_student_by_id(
	id: int,
	db: Session = Depends(get_db),
	current_user: User = Depends(get_current_user),
) -> StudentProfileResponse:
	_require_admin(current_user)

	student = db.query(Student).filter(Student.id == id).first()
	if not student:
		raise HTTPException(status_code=404, detail="Student not found")

	return StudentProfileResponse.model_validate(student)


@router.get("/", response_model=list[StudentProfileResponse])
def list_students(
	skip: int = Query(default=0, ge=0),
	limit: int = Query(default=10, ge=1, le=100),
	db: Session = Depends(get_db),
	current_user: User = Depends(get_current_user),
) -> list[StudentProfileResponse]:
	_require_admin(current_user)

	students = db.query(Student).offset(skip).limit(limit).all()
	return [StudentProfileResponse.model_validate(student) for student in students]
