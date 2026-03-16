from __future__ import annotations

import os
from typing import Dict, List

import joblib
from sqlalchemy.orm import Session

from app.ml.content_filter import ContentFilter
from app.models.internship import Internship
from app.models.student import Student

_MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
_CONTENT_FILTER_PATH = os.path.join(_MODEL_DIR, "content_filter.joblib")


class RecommendationEngine:
    """Hybrid recommendation engine (content-based only for Phase 2).

    On initialisation it either loads a previously trained content filter
    from disk or trains a fresh one against the current database state.

    Collaborative and affirmative-action layers are stubbed and will be
    integrated in later phases.
    """

    def __init__(self, db: Session) -> None:
        self.db = db
        self.content_filter = self.load_or_train(db)

    # ------------------------------------------------------------------
    # Training / persistence
    # ------------------------------------------------------------------

    def load_or_train(self, db: Session) -> ContentFilter:
        """Load persisted model or train from scratch if none exists."""
        if os.path.exists(_CONTENT_FILTER_PATH):
            return joblib.load(_CONTENT_FILTER_PATH)
        return self._train_and_save(db)

    def retrain(self, db: Session) -> ContentFilter:
        """Force retrain from current DB data and persist."""
        self.content_filter = self._train_and_save(db)
        return self.content_filter

    def _train_and_save(self, db: Session) -> ContentFilter:
        internships = (
            db.query(Internship)
            .filter(Internship.is_active.is_(True))
            .all()
        )
        cf = ContentFilter()
        cf.fit(internships)
        os.makedirs(_MODEL_DIR, exist_ok=True)
        joblib.dump(cf, _CONTENT_FILTER_PATH)
        return cf

    # ------------------------------------------------------------------
    # Recommendation
    # ------------------------------------------------------------------

    def recommend(self, student: Student, top_n: int = 5) -> List[Dict]:
        """Return top-N ranked internships for a student.

        Each result dict contains:
            internship_id, title, company, content_score,
            final_score, explanation
        """
        skills = list(student.skills) if student.skills else []
        scored = self.content_filter.score_all(skills)

        # Build an id→internship lookup for the top results
        top_ids = [r["internship_id"] for r in scored[:top_n]]
        internships = (
            self.db.query(Internship)
            .filter(Internship.id.in_(top_ids))
            .all()
        )
        lookup: Dict[int, Internship] = {i.id: i for i in internships}

        results: List[Dict] = []
        for entry in scored[:top_n]:
            iid = entry["internship_id"]
            internship = lookup.get(iid)
            if internship is None:
                continue

            content_score = entry["content_score"]

            # Phase 2: collaborative and affirmative stubs return 0.0
            collaborative_score = self._collaborative_score(student, iid)
            affirmative_score = self._affirmative_score(student, iid)

            # Final score — content only for now (others are 0.0)
            final_score = content_score

            explanation = self.content_filter.explain(skills, iid)

            results.append({
                "internship_id": iid,
                "title": internship.title,
                "company": internship.company,
                "content_score": round(content_score, 4),
                "final_score": round(final_score, 4),
                "explanation": {
                    "matched_skills": explanation["matched_skills"],
                    "missing_skills": explanation["missing_skills"],
                    "content_score": round(explanation["content_score"], 4),
                },
            })

        return results

    # ------------------------------------------------------------------
    # Stub layers (Phase 3 / Phase 4)
    # ------------------------------------------------------------------

    @staticmethod
    def _collaborative_score(student: Student, internship_id: int) -> float:
        """Stub — returns 0.0 until collaborative filtering is implemented."""
        return 0.0

    @staticmethod
    def _affirmative_score(student: Student, internship_id: int) -> float:
        """Stub — returns 0.0 until affirmative action layer is implemented."""
        return 0.0
