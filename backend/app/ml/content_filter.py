from __future__ import annotations

from typing import Dict, List

from sklearn.metrics.pairwise import cosine_similarity

from app.ml.vectorizer import SkillVectorizer
from app.models.internship import Internship


class ContentFilter:
    """Content-based recommendation layer.

    Fits a TF-IDF model on internship required_skills, then scores any
    student skill set against every internship via cosine similarity.
    """

    def __init__(self) -> None:
        self.vectorizer = SkillVectorizer()
        self._internship_ids: List[int] = []
        self._internship_skills: List[List[str]] = []
        self._matrix = None  # sparse matrix (n_internships, n_features)
        self._is_fitted = False

    # ------------------------------------------------------------------
    # Training
    # ------------------------------------------------------------------

    def fit(self, internships: List[Internship]) -> "ContentFilter":
        """Build TF-IDF matrix from internship required_skills."""
        self._internship_ids = [i.id for i in internships]
        # Normalise to lowercase at storage time so that explain()
        # comparisons are always case-insensitive.
        self._internship_skills = [
            [s.lower() for s in i.required_skills] if i.required_skills else []
            for i in internships
        ]
        self._matrix = self.vectorizer.fit_transform(self._internship_skills)
        self._is_fitted = True
        return self

    # ------------------------------------------------------------------
    # Scoring
    # ------------------------------------------------------------------

    def score(self, student_skills: List[str], internship_id: int) -> float:
        """Cosine similarity between student skills and one internship."""
        if not self._is_fitted:
            raise RuntimeError("ContentFilter has not been fitted yet.")

        if internship_id not in self._internship_ids:
            return 0.0

        student_vec = self.vectorizer.transform(student_skills)
        idx = self._internship_ids.index(internship_id)
        internship_vec = self._matrix[idx]
        sim = cosine_similarity(student_vec, internship_vec)[0][0]
        return float(max(0.0, min(1.0, sim)))

    def score_all(self, student_skills: List[str]) -> List[Dict]:
        """Score student against every internship, sorted descending."""
        if not self._is_fitted:
            raise RuntimeError("ContentFilter has not been fitted yet.")

        student_vec = self.vectorizer.transform(student_skills)
        similarities = cosine_similarity(student_vec, self._matrix)[0]

        results = []
        for idx, iid in enumerate(self._internship_ids):
            results.append({
                "internship_id": iid,
                "content_score": float(max(0.0, min(1.0, similarities[idx]))),
            })

        results.sort(key=lambda r: r["content_score"], reverse=True)
        return results

    # ------------------------------------------------------------------
    # Explainability
    # ------------------------------------------------------------------

    def explain(
        self, student_skills: List[str], internship_id: int
    ) -> Dict:
        """Return matched/missing skills and content score for one pair."""
        content_score = self.score(student_skills, internship_id)

        if internship_id not in self._internship_ids:
            return {
                "matched_skills": [],
                "missing_skills": [],
                "content_score": content_score,
            }

        idx = self._internship_ids.index(internship_id)
        # _internship_skills is already lowercased from fit()
        required = set(self._internship_skills[idx])
        student = {s.lower() for s in student_skills}

        matched = sorted(required & student)
        missing = sorted(required - student)

        return {
            "matched_skills": matched,
            "missing_skills": missing,
            "content_score": content_score,
        }
