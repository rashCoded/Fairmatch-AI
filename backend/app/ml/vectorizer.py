from __future__ import annotations

import os
from typing import List

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer


class SkillVectorizer:
    """Wraps sklearn TfidfVectorizer for skill-list inputs.

    Each skill list (e.g. ["Python", "FastAPI", "Docker"]) is joined into a
    single space-separated lowercase string before being fed to TF-IDF.  This
    lets the vectorizer treat every skill token equally and naturally weight
    rare skills higher than common ones.
    """

    def __init__(self) -> None:
        self._vectorizer = TfidfVectorizer(lowercase=True)
        self._is_fitted = False

    # ------------------------------------------------------------------
    # Internal helper
    # ------------------------------------------------------------------

    @staticmethod
    def _join(skill_lists: List[List[str]]) -> List[str]:
        """Convert list-of-lists into list of joined strings."""
        return [" ".join(skills).lower() for skills in skill_lists]

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def fit(self, skill_lists: List[List[str]]) -> "SkillVectorizer":
        """Train the TF-IDF vocabulary on a corpus of skill lists."""
        docs = self._join(skill_lists)
        self._vectorizer.fit(docs)
        self._is_fitted = True
        return self

    def transform(self, skill_list: List[str]):
        """Vectorize a *single* skill list and return a sparse row vector."""
        if not self._is_fitted:
            raise RuntimeError("SkillVectorizer has not been fitted yet.")
        doc = " ".join(skill_list).lower()
        return self._vectorizer.transform([doc])

    def fit_transform(self, skill_lists: List[List[str]]):
        """Fit and transform in one step; returns the full sparse matrix."""
        docs = self._join(skill_lists)
        matrix = self._vectorizer.fit_transform(docs)
        self._is_fitted = True
        return matrix

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def save(self, path: str) -> None:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        joblib.dump(self._vectorizer, path)

    def load(self, path: str) -> "SkillVectorizer":
        self._vectorizer = joblib.load(path)
        self._is_fitted = True
        return self
