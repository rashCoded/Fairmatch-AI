
from typing import List, Union
from pathlib import Path

from pydantic import AnyHttpUrl, EmailStr, PostgresDsn, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "FairMatch AI"
    
    # CORS
    BACKEND_CORS_ORIGINS: List[AnyHttpUrl] = ["http://localhost:3000", "http://localhost:8000"]

    # Database
    POSTGRES_SERVER: str
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    POSTGRES_PORT: int = 5432
    DATABASE_URL: Union[PostgresDsn, str] = ""

    @computed_field
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        if self.DATABASE_URL:
            return str(self.DATABASE_URL)
        return str(PostgresDsn.build(
            scheme="postgresql",
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_SERVER,
            port=self.POSTGRES_PORT,
            path=self.POSTGRES_DB,
        ))

    # Security
    SECRET_KEY: str = "changethis"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # OTP
    OTP_EXPIRE_MINUTES: int = 10
    
    # Email (SMTP)
    SMTP_TLS: bool = True
    SMTP_PORT: int = 587
    SMTP_HOST: str | None = None
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAILS_FROM_EMAIL: EmailStr | None = None
    EMAILS_FROM_NAME: str = "FairMatch AI"
    # Backward-compatible aliases for older env naming.
    MAIL_USERNAME: str | None = None
    MAIL_PASSWORD: str | None = None

    # ML Weights - Hybrid Recommendation Engine
    CONTENT_WEIGHT: float = 0.50
    COLLABORATIVE_WEIGHT: float = 0.30
    AFFIRMATIVE_WEIGHT: float = 0.20

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8", 
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
