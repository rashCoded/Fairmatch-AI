from __future__ import annotations

from typing import Dict, List

from app.models.internship import Internship
from app.models.student import Student


class AffirmativeScorer:
    """Affirmative action scoring layer.

    Assigns a boost (0.0–1.0) to a student–internship pair based on
    demographic and equity rules.  No training required — instantiate
    and call directly.

    Scoring rules
    -------------
    * is_rural == True                     → +0.30
    * social_category in ("SC", "ST")      → +0.30
    * social_category == "OBC"             → +0.15
    * has_previous_internship == False      → +0.25
    * internship.capacity_ratio > 0.8      → −0.20  (penalise near-full)

    Final score is clamped to [0.0, 1.0].
    """

    # ---- boost / penalty constants ----
    RURAL_BOOST: float = 0.30
    SC_ST_BOOST: float = 0.30
    OBC_BOOST: float = 0.15
    NO_PRIOR_INTERNSHIP_BOOST: float = 0.25
    HIGH_CAPACITY_PENALTY: float = -0.20

    def score(self, student: Student, internship: Internship) -> float:
        """Return an affirmative-action score in [0.0, 1.0]."""
        value = 0.0

        # Rural background
        if student.is_rural:
            value += self.RURAL_BOOST

        # Social category
        category = (student.social_category or "").upper()
        if category in ("SC", "ST"):
            value += self.SC_ST_BOOST
        elif category == "OBC":
            value += self.OBC_BOOST

        # First-time intern
        if not student.has_previous_internship:
            value += self.NO_PRIOR_INTERNSHIP_BOOST

        # Penalise internships that are nearly full
        if internship.capacity_ratio > 0.8:
            value += self.HIGH_CAPACITY_PENALTY

        # Clamp to [0.0, 1.0]
        return max(0.0, min(1.0, value))

    def score_all(
        self,
        student: Student,
        internships: List[Internship],
    ) -> List[Dict]:
        """Score a student against many internships.

        Returns a list of dicts, each with *internship_id* and
        *affirmative_score*, sorted by score descending.
        """
        results: List[Dict] = []
        for internship in internships:
            results.append({
                "internship_id": internship.id,
                "affirmative_score": self.score(student, internship),
            })
        results.sort(key=lambda r: r["affirmative_score"], reverse=True)
        return results
