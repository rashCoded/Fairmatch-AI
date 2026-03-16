from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from app.db import base  # noqa - ensures all models are loaded before mapper config

from app.api.v1.endpoints.admin import router as admin_router
from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.internships import router as internships_router
from app.api.v1.endpoints.recommend import router as recommend_router
from app.api.v1.endpoints.students import router as students_router
from app.core.config import settings

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="AI-Based Smart Allocation Engine for PM Internship Scheme",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )

    # Inject HTTPBearer security scheme so Swagger's Authorize dialog
    # shows a simple "Bearer token" input instead of the OAuth2 form.
    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }
    }
    openapi_schema["security"] = [{"BearerAuth": []}]

    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi

# Set all CORS enabled origins
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.get("/health", tags=["health"])
def health_check():
    """
    Health check endpoint to verify backend status.
    """
    return {
        "status": "healthy",
        "project": settings.PROJECT_NAME,
        "weights": {
            "content": settings.CONTENT_WEIGHT,
            "collaborative": settings.COLLABORATIVE_WEIGHT,
            "affirmative": settings.AFFIRMATIVE_WEIGHT,
        },
    }


app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(students_router, prefix=settings.API_V1_STR)
app.include_router(internships_router, prefix=settings.API_V1_STR)
app.include_router(admin_router, prefix=f"{settings.API_V1_STR}/admin")
app.include_router(recommend_router, prefix=f"{settings.API_V1_STR}/recommend")
