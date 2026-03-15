from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class SocialCategoryEnum(str, Enum):
	GEN = "GEN"
	OBC = "OBC"
	SC = "SC"
	ST = "ST"


class StudentProfileCreate(BaseModel):
	full_name: str = Field(min_length=1, max_length=255)
	phone: str | None = Field(default=None, max_length=20)
	college: str | None = Field(default=None, max_length=255)
	degree: str | None = Field(default=None, max_length=100)
	branch: str | None = Field(default=None, max_length=100)
	graduation_year: int | None = Field(default=None, ge=2000, le=2100)
	cgpa: float | None = Field(default=None, ge=0.0, le=10.0)
	skills: list[str] = Field(default_factory=list)
	district: str | None = Field(default=None, max_length=100)
	state: str | None = Field(default=None, max_length=100)
	is_rural: bool = False
	social_category: SocialCategoryEnum | None = None
	has_previous_internship: bool = False
	resume_path: str | None = Field(default=None, max_length=1024)


class StudentProfileUpdate(BaseModel):
	full_name: str | None = Field(default=None, min_length=1, max_length=255)
	phone: str | None = Field(default=None, max_length=20)
	college: str | None = Field(default=None, max_length=255)
	degree: str | None = Field(default=None, max_length=100)
	branch: str | None = Field(default=None, max_length=100)
	graduation_year: int | None = Field(default=None, ge=2000, le=2100)
	cgpa: float | None = Field(default=None, ge=0.0, le=10.0)
	skills: list[str] | None = None
	district: str | None = Field(default=None, max_length=100)
	state: str | None = Field(default=None, max_length=100)
	is_rural: bool | None = None
	social_category: SocialCategoryEnum | None = None
	has_previous_internship: bool | None = None
	resume_path: str | None = Field(default=None, max_length=1024)


class StudentProfileResponse(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: int
	user_id: int
	full_name: str
	phone: str | None
	college: str | None
	degree: str | None
	branch: str | None
	graduation_year: int | None
	cgpa: float | None
	skills: list[str]
	district: str | None
	state: str | None
	is_rural: bool
	social_category: SocialCategoryEnum | None
	has_previous_internship: bool
	resume_path: str | None
	created_at: datetime
	updated_at: datetime
