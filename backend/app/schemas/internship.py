from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class InternshipCreate(BaseModel):
	title: str = Field(min_length=1, max_length=255)
	company: str = Field(min_length=1, max_length=255)
	sector: str = Field(min_length=1, max_length=100)
	location: str = Field(min_length=1, max_length=255)
	state: str = Field(min_length=1, max_length=100)
	required_skills: list[str] = Field(default_factory=list)
	description: str | None = None
	duration_months: int = Field(default=3, ge=1, le=24)
	stipend: float = Field(default=0.0, ge=0.0)
	total_seats: int = Field(default=1, ge=1)
	filled_seats: int = Field(default=0, ge=0)


class InternshipUpdate(BaseModel):
	title: str | None = Field(default=None, min_length=1, max_length=255)
	company: str | None = Field(default=None, min_length=1, max_length=255)
	sector: str | None = Field(default=None, min_length=1, max_length=100)
	location: str | None = Field(default=None, min_length=1, max_length=255)
	state: str | None = Field(default=None, min_length=1, max_length=100)
	required_skills: list[str] | None = None
	description: str | None = None
	duration_months: int | None = Field(default=None, ge=1, le=24)
	stipend: float | None = Field(default=None, ge=0.0)
	total_seats: int | None = Field(default=None, ge=1)
	filled_seats: int | None = Field(default=None, ge=0)
	is_active: bool | None = None


class InternshipResponse(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: int
	title: str
	company: str
	sector: str
	location: str
	state: str
	required_skills: list[str]
	description: str | None
	duration_months: int
	stipend: float
	total_seats: int
	filled_seats: int
	is_active: bool
	available_seats: int
	capacity_ratio: float
	created_at: datetime
	updated_at: datetime
