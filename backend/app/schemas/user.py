from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserRoleEnum(str, Enum):
	STUDENT = "student"
	ADMIN = "admin"


class RegisterRequest(BaseModel):
	email: EmailStr
	password: str = Field(min_length=6, max_length=128)


class RegisterResponse(BaseModel):
	message: str


class VerifyOtpRequest(BaseModel):
	email: EmailStr
	otp: str = Field(min_length=6, max_length=6, pattern=r"^[0-9]{6}$")


class LoginRequest(BaseModel):
	email: EmailStr
	password: str = Field(min_length=6, max_length=128)


class TokenPairResponse(BaseModel):
	access_token: str
	refresh_token: str


class LoginResponse(BaseModel):
	access_token: str
	refresh_token: str
	role: UserRoleEnum


class CurrentUserResponse(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: int
	email: EmailStr
	role: UserRoleEnum
	is_verified: bool
	is_active: bool
	created_at: datetime
	updated_at: datetime
