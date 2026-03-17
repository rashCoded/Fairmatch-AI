from datetime import datetime
from typing import List

from sqlalchemy.orm import Session

from app.models.recommendation import Recommendation


def _as_string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


def save_recommendations(db: Session, student_id: int, recommendations: List[dict]) -> None:
    """Upsert recommendation rows for a student.

    Existing rows for the student are set inactive first, then rows from the
    latest recommendation run are inserted/updated and marked active.
    """
    now = datetime.utcnow()

    existing_rows = (
        db.query(Recommendation)
        .filter(Recommendation.student_id == student_id)
        .all()
    )
    existing_by_internship = {row.internship_id: row for row in existing_rows}

    for row in existing_rows:
        row.is_active = False

    for rec in recommendations:
        internship_id = int(rec["internship_id"])
        explanation = rec.get("explanation") or {}

        matched_skills = _as_string_list(
            explanation.get("matched_skills", rec.get("matched_skills", []))
        )
        missing_skills = _as_string_list(
            explanation.get("missing_skills", rec.get("missing_skills", []))
        )

        score_breakdown = rec.get("score_breakdown")
        if not isinstance(score_breakdown, dict):
            score_breakdown = {
                "content_score": float(rec.get("content_score", 0.0)),
                "collaborative_score": float(rec.get("collaborative_score", 0.0)),
                "affirmative_score": float(rec.get("affirmative_score", 0.0)),
                "final_score": float(rec.get("final_score", 0.0)),
                "explanation": {
                    "matched_skills": matched_skills,
                    "missing_skills": missing_skills,
                    "content_score": float(
                        explanation.get("content_score", rec.get("content_score", 0.0))
                    ),
                },
            }

        existing = existing_by_internship.get(internship_id)
        if existing:
            existing.content_score = float(rec.get("content_score", 0.0))
            existing.collaborative_score = float(rec.get("collaborative_score", 0.0))
            existing.affirmative_score = float(rec.get("affirmative_score", 0.0))
            existing.final_score = float(rec.get("final_score", 0.0))
            existing.matched_skills = matched_skills
            existing.missing_skills = missing_skills
            existing.score_breakdown = score_breakdown
            existing.generated_at = now
            existing.is_active = True
            continue

        db.add(
            Recommendation(
                student_id=student_id,
                internship_id=internship_id,
                content_score=float(rec.get("content_score", 0.0)),
                collaborative_score=float(rec.get("collaborative_score", 0.0)),
                affirmative_score=float(rec.get("affirmative_score", 0.0)),
                final_score=float(rec.get("final_score", 0.0)),
                matched_skills=matched_skills,
                missing_skills=missing_skills,
                score_breakdown=score_breakdown,
                generated_at=now,
                is_active=True,
            )
        )

    db.commit()


def get_saved_recommendations(db: Session, student_id: int) -> List[Recommendation]:
    """Return active persisted recommendations for a student."""
    return (
        db.query(Recommendation)
        .filter(
            Recommendation.student_id == student_id,
            Recommendation.is_active.is_(True),
        )
        .order_by(Recommendation.final_score.desc())
        .all()
    )


def clear_recommendations(db: Session, student_id: int) -> None:
    """Deactivate all persisted recommendations for a student."""
    (
        db.query(Recommendation)
        .filter(Recommendation.student_id == student_id)
        .update({Recommendation.is_active: False}, synchronize_session=False)
    )
    db.commit()