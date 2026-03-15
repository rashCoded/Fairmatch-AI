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
