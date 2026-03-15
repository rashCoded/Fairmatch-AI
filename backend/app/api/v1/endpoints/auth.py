from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import create_access_token, create_refresh_token
from app.db.database import get_db
from app.schemas.user import (
	CurrentUserResponse,
	LoginRequest,
	LoginResponse,
	RegisterRequest,
	RegisterResponse,
	TokenPairResponse,
	VerifyOtpRequest,
)
from app.services.auth_service import (
	get_current_user,
	login_user,
	register_user,
	verify_otp,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=RegisterResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> RegisterResponse:
	register_user(
		db=db,
		email=payload.email,
		password=payload.password,
	)
	return RegisterResponse(message="OTP sent to your email")


@router.post("/verify-otp", response_model=TokenPairResponse)
def verify_otp_endpoint(payload: VerifyOtpRequest, db: Session = Depends(get_db)) -> TokenPairResponse:
	user = verify_otp(db=db, email=payload.email, otp=payload.otp)
	access_token = create_access_token(subject=user.id)
	refresh_token = create_refresh_token(subject=user.id)
	return TokenPairResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
	tokens = login_user(db=db, email=payload.email, password=payload.password)
	return LoginResponse(
		access_token=tokens["access_token"],
		refresh_token=tokens["refresh_token"],
		role=tokens["role"],
	)


@router.get("/me", response_model=CurrentUserResponse)
def get_me(current_user=Depends(get_current_user)) -> CurrentUserResponse:
	return CurrentUserResponse.model_validate(current_user)
