from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, computed_field


class ApplicationStatusEnum(str, Enum):
	PENDING = "pending"
	UNDER_REVIEW = "under_review"
	SELECTED = "selected"
	REJECTED = "rejected"


class ApplicationCreate(BaseModel):
	student_id: int
	internship_id: int


class ApplicationApplyRequest(BaseModel):
	internship_id: int


class ApplicationStatusUpdate(BaseModel):
	status: ApplicationStatusEnum


class ApplicationResponse(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: int
	student_id: int
	internship_id: int
	status: ApplicationStatusEnum
	content_score: float
	collaborative_score: float
	affirmative_score: float
	final_score: float
	score_breakdown: dict[str, Any]
	created_at: datetime
	updated_at: datetime

	@computed_field
	@property
	def applied_at(self) -> datetime:
		return self.created_at


class AdminStudentApplicationResponse(BaseModel):
	id: int
	student_id: int
	student_name: str
	student_college: str | None = None
	student_branch: str | None = None
	student_graduation_year: int | None = None
	student_cgpa: float | None = None
	student_skills: list[str]
	student_district: str | None = None
	student_state: str | None = None
	social_category: str | None = None
	is_rural: bool
	has_previous_internship: bool
	internship_id: int
	internship_title: str
	company: str
	internship_location: str
	internship_state: str
	internship_sector: str
	internship_duration_months: int
	internship_stipend: float
	internship_required_skills: list[str]
	internship_total_seats: int
	internship_filled_seats: int
	internship_available_seats: int
	status: ApplicationStatusEnum
	content_score: float
	collaborative_score: float
	affirmative_score: float
	final_score: float
	matched_skills: list[str]
	missing_skills: list[str]
	applied_at: datetime


class RecentAllocationResponse(BaseModel):
	id: int
	student_id: int
	student_name: str
	student_college: str | None = None
	student_branch: str | None = None
	student_graduation_year: int | None = None
	student_cgpa: float | None = None
	student_skills: list[str]
	student_district: str | None = None
	student_state: str | None = None
	social_category: str | None = None
	is_rural: bool
	has_previous_internship: bool
	internship_id: int
	internship_title: str
	company: str
	internship_location: str
	internship_state: str
	internship_sector: str
	internship_duration_months: int
	internship_stipend: float
	internship_required_skills: list[str]
	internship_total_seats: int
	internship_filled_seats: int
	internship_available_seats: int
	status: ApplicationStatusEnum
	content_score: float
	collaborative_score: float
	affirmative_score: float
	final_score: float
	matched_skills: list[str]
	missing_skills: list[str]
	applied_at: datetime


class ManualAllocationOverrideRequest(BaseModel):
	student_id: int
	internship_id: int
