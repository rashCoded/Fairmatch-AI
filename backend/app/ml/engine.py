from __future__ import annotations

import os
from typing import Dict, List

import joblib
from sqlalchemy.orm import Session

from app.core.config import settings
from app.ml.affirmative import AffirmativeScorer
from app.ml.collaborative_filter import CollaborativeFilter
from app.ml.content_filter import ContentFilter
from app.models.application import Application, ApplicationStatus
from app.models.internship import Internship
from app.models.student import Student

_MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
_CONTENT_FILTER_PATH = os.path.join(_MODEL_DIR, "content_filter.joblib")
_COLLABORATIVE_FILTER_PATH = os.path.join(_MODEL_DIR, "collaborative_filter.joblib")


class RecommendationEngine:
    """Hybrid recommendation engine (content + collaborative + affirmative).

    On initialisation it either loads previously trained models from disk
    or trains fresh ones against the current database state.

    The AffirmativeScorer is rule-based and requires no training — it is
    instantiated directly on each engine creation.
    """

    def __init__(self, db: Session) -> None:
        self.db = db
        self.content_filter, self.collaborative_filter = self.load_or_train(db)
        self.affirmative_scorer = AffirmativeScorer()

    # ------------------------------------------------------------------
    # Training / persistence
    # ------------------------------------------------------------------

    def load_or_train(self, db: Session):
        """Load persisted models or train from scratch if none exist."""
        cf_exists = os.path.exists(_CONTENT_FILTER_PATH)
        collab_exists = os.path.exists(_COLLABORATIVE_FILTER_PATH)

        if cf_exists and collab_exists:
            cf = joblib.load(_CONTENT_FILTER_PATH)
            collab = joblib.load(_COLLABORATIVE_FILTER_PATH)
            return cf, collab

        return self._train_and_save(db)

    def retrain(self, db: Session):
        """Force retrain from current DB data and persist."""
        for path in (_CONTENT_FILTER_PATH, _COLLABORATIVE_FILTER_PATH):
            if os.path.exists(path):
                os.remove(path)

        self.content_filter, self.collaborative_filter = self._train_and_save(db)

    def _train_and_save(self, db: Session):
        os.makedirs(_MODEL_DIR, exist_ok=True)

        # Content filter
        internships = (
            db.query(Internship)
            .filter(Internship.is_active.is_(True))
            .all()
        )
        cf = ContentFilter()
        cf.fit(internships)
        joblib.dump(cf, _CONTENT_FILTER_PATH)

        # Collaborative filter
        interaction_data = self._get_interaction_data(db)
        collab = CollaborativeFilter()
        collab.fit(interaction_data)
        joblib.dump(collab, _COLLABORATIVE_FILTER_PATH)

        return cf, collab

    @staticmethod
    def _get_interaction_data(db: Session) -> List[Dict]:
        """Query Application table and return interaction dicts.

        score mapping:
            selected -> 1.0
            everything else (pending, under_review, rejected) -> 0.5
        """
        applications = db.query(Application).all()
        data: List[Dict] = []
        for app in applications:
            if app.status == ApplicationStatus.SELECTED:
                score = 1.0
            else:
                score = 0.5
            data.append({
                "student_id": app.student_id,
                "internship_id": app.internship_id,
                "score": score,
            })
        return data

    # ------------------------------------------------------------------
    # Recommendation
    # ------------------------------------------------------------------

    def recommend(self, student: Student, top_n: int = 5) -> List[Dict]:
        """Return top-N ranked internships for a student.

        Blending formula:
            final = (CONTENT_WEIGHT x content) +
                    (COLLABORATIVE_WEIGHT x collaborative) +
                    (AFFIRMATIVE_WEIGHT x affirmative)

        Cold-start: when collaborative returns no data for a student,
        re-normalise so that content weight fills the full score
        range instead of leaving the collaborative portion as zero.
        """
        skills = [s.lower() for s in student.skills] if student.skills else []

        # Content scores for every internship
        content_scores = self.content_filter.score_all(skills)
        content_map: Dict[int, float] = {
            r["internship_id"]: r["content_score"] for r in content_scores
        }

        # Collaborative scores — may be empty for cold-start students
        collab_map: Dict[int, float] = {}
        collab_scores = self.collaborative_filter.score_all(student.id)
        for r in collab_scores:
            collab_map[r["internship_id"]] = r["collaborative_score"]

        # Determine effective weights.  When the collaborative filter
        # returns nothing (cold-start), redistribute its weight to
        # content so results aren't artificially halved.
        has_collab = len(collab_map) > 0
        if has_collab:
            w_content = settings.CONTENT_WEIGHT
            w_collab = settings.COLLABORATIVE_WEIGHT
        else:
            w_content = settings.CONTENT_WEIGHT + settings.COLLABORATIVE_WEIGHT
            w_collab = 0.0

        # Pre-fetch all active internships for affirmative scoring
        all_internship_ids = list(content_map.keys())
        internships_for_aff = (
            self.db.query(Internship)
            .filter(Internship.id.in_(all_internship_ids))
            .all()
        )
        internship_lookup: Dict[int, Internship] = {
            i.id: i for i in internships_for_aff
        }

        # Use content_map as the authoritative set of internship IDs —
        # it covers every active internship.
        blended: List[Dict] = []
        for iid in content_map:
            c_score = content_map[iid]
            co_score = collab_map.get(iid, 0.0)

            # Affirmative score — rule-based, no training needed
            internship_obj = internship_lookup.get(iid)
            if internship_obj is not None:
                aff_score = self.affirmative_scorer.score(student, internship_obj)
            else:
                aff_score = 0.0

            final = (
                w_content * c_score
                + w_collab * co_score
                + settings.AFFIRMATIVE_WEIGHT * aff_score
            )
            blended.append({
                "internship_id": iid,
                "content_score": c_score,
                "collaborative_score": co_score,
                "affirmative_score": aff_score,
                "final_score": final,
            })

        blended.sort(key=lambda r: r["final_score"], reverse=True)

        # Build an id->internship lookup for the top results
        top_ids = [r["internship_id"] for r in blended[:top_n]]
        # Re-use already-fetched internship objects
        lookup: Dict[int, Internship] = {
            iid: internship_lookup[iid]
            for iid in top_ids
            if iid in internship_lookup
        }

        results: List[Dict] = []
        for entry in blended[:top_n]:
            iid = entry["internship_id"]
            internship = lookup.get(iid)
            if internship is None:
                continue

            explanation = self.content_filter.explain(skills, iid)

            results.append({
                "internship_id": iid,
                "title": internship.title,
                "company": internship.company,
                "content_score": round(entry["content_score"], 4),
                "collaborative_score": round(entry["collaborative_score"], 4),
                "affirmative_score": round(entry["affirmative_score"], 4),
                "final_score": round(entry["final_score"], 4),
                "explanation": {
                    "matched_skills": explanation["matched_skills"],
                    "missing_skills": explanation["missing_skills"],
                    "content_score": round(explanation["content_score"], 4),
                },
            })

        return results
