from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def recommend_placeholder() -> dict[str, str]:
	return {"status": "coming soon"}
