from pydantic import BaseModel


class ExplanationResult(BaseModel):
    matched_skills: list[str]
    missing_skills: list[str]
    content_score: float


class RecommendationResult(BaseModel):
    internship_id: int
    title: str
    company: str
    content_score: float
    collaborative_score: float
    final_score: float
    explanation: ExplanationResult


class RecommendationResponse(BaseModel):
    student_id: int
    recommendations: list[RecommendationResult]
