import logging
from pathlib import Path
from typing import Any

import pdfplumber
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
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
from app.services.recommendation_service import clear_recommendations

router = APIRouter(prefix="/students", tags=["students"])
logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[4]
RESUME_UPLOAD_DIR = BACKEND_DIR / "uploads" / "resumes"

# Keep this exactly aligned with TECH_SKILLS in app/ml/data_generator.py.
SKILL_VOCABULARY = [
	"Python",
	"Java",
	"C++",
	"JavaScript",
	"TypeScript",
	"SQL",
	"PostgreSQL",
	"MySQL",
	"MongoDB",
	"Redis",
	"Docker",
	"Kubernetes",
	"AWS",
	"Azure",
	"GCP",
	"FastAPI",
	"Django",
	"Flask",
	"React",
	"Node.js",
	"Git",
	"Linux",
	"Data Structures",
	"Algorithms",
	"Machine Learning",
	"Deep Learning",
	"Pandas",
	"NumPy",
	"scikit-learn",
	"TensorFlow",
]

RECOMMENDATION_RELEVANT_FIELDS = {
	"skills",
	"district",
	"state",
	"is_rural",
	"social_category",
	"has_previous_internship",
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


def _extract_skills_from_text(text: str) -> list[str]:
	if not text.strip():
		return []

	lower_text = text.lower()
	matched: list[str] = []
	for skill in SKILL_VOCABULARY:
		if skill.lower() in lower_text:
			matched.append(skill)

	return matched


def _merge_skills(existing: list[str] | None, extracted: list[str]) -> list[str]:
	merged: list[str] = []
	seen: set[str] = set()

	for skill in (existing or []) + extracted:
		normalized = str(skill).strip()
		if not normalized:
			continue

		key = normalized.lower()
		if key in seen:
			continue

		seen.add(key)
		merged.append(normalized)

	return merged


def _normalize_skill_list(skills: list[str] | None) -> list[str]:
	if not skills:
		return []

	normalized: list[str] = []
	seen: set[str] = set()
	for skill in skills:
		value = str(skill).strip().lower()
		if not value or value in seen:
			continue
		seen.add(value)
		normalized.append(value)

	return sorted(normalized)


def _recommendation_relevant_changes(student: Student, update_data: dict[str, Any]) -> bool:
	for field in RECOMMENDATION_RELEVANT_FIELDS:
		if field not in update_data:
			continue

		new_value = update_data[field]
		old_value = getattr(student, field)

		if field == "skills":
			if _normalize_skill_list(old_value) != _normalize_skill_list(new_value):
				return True
			continue

		if old_value != new_value:
			return True

	return False


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

	should_clear_recommendations = _recommendation_relevant_changes(student, update_data)

	for field, value in update_data.items():
		setattr(student, field, value)

	db.add(student)
	db.commit()
	db.refresh(student)

	if should_clear_recommendations:
		clear_recommendations(db, student.id)
		db.refresh(student)

	return StudentProfileResponse.model_validate(student)


@router.post("/resume")
async def upload_resume(
	file: UploadFile = File(...),
	db: Session = Depends(get_db),
	current_user: User = Depends(get_current_user),
) -> dict:
	_require_student(current_user)

	if not file.filename:
		raise HTTPException(status_code=400, detail="No file uploaded")

	filename_lower = file.filename.lower()
	is_pdf_by_name = filename_lower.endswith(".pdf")
	is_pdf_by_content_type = (file.content_type or "").lower() in {
		"application/pdf",
		"application/x-pdf",
	}
	if not is_pdf_by_name and not is_pdf_by_content_type:
		raise HTTPException(status_code=400, detail="Only PDF files are allowed")

	student = db.query(Student).filter(Student.user_id == current_user.id).first()
	if not student:
		raise HTTPException(status_code=404, detail="Student profile not found")

	RESUME_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
	saved_path = RESUME_UPLOAD_DIR / f"{student.id}.pdf"

	file_bytes = await file.read()
	await file.close()
	if not file_bytes:
		raise HTTPException(status_code=400, detail="Uploaded file is empty")

	with saved_path.open("wb") as buffer:
		buffer.write(file_bytes)

	extracted_text = ""
	try:
		with pdfplumber.open(saved_path) as pdf:
			pages: list[str] = []
			for page in pdf.pages:
				page_text = page.extract_text() or ""
				if page_text:
					pages.append(page_text)
			extracted_text = "\n".join(pages)
	except Exception:
		# Graceful fallback requested: keep uploaded file and return empty skills.
		logger.exception("Failed to extract text from resume PDF for student_id=%s", student.id)

	extracted_skills = _extract_skills_from_text(extracted_text) if extracted_text else []
	student.skills = _merge_skills(student.skills, extracted_skills)
	student.resume_path = str(saved_path.relative_to(BACKEND_DIR)).replace("\\", "/")

	db.add(student)
	db.commit()
	db.refresh(student)

	resume_path = student.resume_path
	clear_recommendations(db, student.id)

	return {
		"extracted_skills": extracted_skills,
		"resume_path": resume_path,
	}


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
