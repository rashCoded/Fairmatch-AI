from fastapi import APIRouter

router = APIRouter(tags=["admin"])


@router.get("/")
def admin_placeholder() -> dict[str, str]:
	return {"status": "coming soon"}
