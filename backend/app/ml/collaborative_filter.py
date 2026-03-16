from __future__ import annotations

import os
from typing import Dict, List

import joblib
import numpy as np
from scipy.sparse import csr_matrix
from sklearn.neighbors import NearestNeighbors


class CollaborativeFilter:
    """User-based collaborative filtering layer.

    Builds a student-internship interaction matrix from historical
    application data.  Uses sklearn NearestNeighbors (cosine metric)
    to find the K most similar students, then scores each internship
    based on those neighbours' interactions.
    """

    def __init__(self, n_neighbors: int = 5) -> None:
        self._n_neighbors = n_neighbors
        self._model: NearestNeighbors | None = None
        self._matrix: csr_matrix | None = None
        self._student_idx: Dict[int, int] = {}
        self._internship_idx: Dict[int, int] = {}
        self._idx_internship: Dict[int, int] = {}
        self._is_fitted = False

    # ------------------------------------------------------------------
    # Training
    # ------------------------------------------------------------------

    def fit(self, interaction_data: List[Dict]) -> "CollaborativeFilter":
        """Build interaction matrix and fit NearestNeighbors.

        Each element of *interaction_data* is a dict with keys:
            student_id, internship_id, score
        where score is 1.0 (selected), 0.5 (applied/pending), or 0.0.
        """
        if not interaction_data:
            self._is_fitted = True
            return self

        # Build index mappings
        student_ids = sorted({d["student_id"] for d in interaction_data})
        internship_ids = sorted({d["internship_id"] for d in interaction_data})

        self._student_idx = {sid: i for i, sid in enumerate(student_ids)}
        self._internship_idx = {iid: i for i, iid in enumerate(internship_ids)}
        self._idx_internship = {i: iid for iid, i in self._internship_idx.items()}

        n_students = len(student_ids)
        n_internships = len(internship_ids)

        # Populate interaction matrix
        rows, cols, vals = [], [], []
        for d in interaction_data:
            r = self._student_idx[d["student_id"]]
            c = self._internship_idx[d["internship_id"]]
            rows.append(r)
            cols.append(c)
            vals.append(d["score"])

        self._matrix = csr_matrix(
            (vals, (rows, cols)),
            shape=(n_students, n_internships),
        )

        # Fit NearestNeighbors — use min(n_neighbors, n_students-1) so we
        # never ask for more neighbours than exist.
        effective_k = min(self._n_neighbors, max(n_students - 1, 1))
        self._model = NearestNeighbors(
            n_neighbors=effective_k, metric="cosine", algorithm="brute"
        )
        self._model.fit(self._matrix)
        self._is_fitted = True
        return self

    # ------------------------------------------------------------------
    # Scoring
    # ------------------------------------------------------------------

    def score(self, student_id: int, internship_id: int) -> float:
        """Score one student-internship pair via collaborative filtering."""
        if not self._is_fitted or self._matrix is None:
            return 0.0

        if student_id not in self._student_idx:
            return 0.0
        if internship_id not in self._internship_idx:
            return 0.0

        s_idx = self._student_idx[student_id]
        i_idx = self._internship_idx[internship_id]

        student_vec = self._matrix[s_idx]
        distances, indices = self._model.kneighbors(student_vec)

        # Weighted average of neighbour scores for this internship.
        # Convert cosine *distance* to similarity: sim = 1 - dist.
        sims = 1.0 - distances[0]
        neighbour_scores = np.array(
            [self._matrix[idx, i_idx] for idx in indices[0]]
        )

        total_sim = sims.sum()
        if total_sim == 0:
            return 0.0

        weighted = float((sims * neighbour_scores).sum() / total_sim)
        return max(0.0, min(1.0, weighted))

    def score_all(self, student_id: int) -> List[Dict]:
        """Score student against every internship, sorted descending."""
        if not self._is_fitted or self._matrix is None:
            return []

        if student_id not in self._student_idx:
            return []

        s_idx = self._student_idx[student_id]
        student_vec = self._matrix[s_idx]
        distances, indices = self._model.kneighbors(student_vec)

        sims = 1.0 - distances[0]
        total_sim = sims.sum()

        results: List[Dict] = []
        n_internships = self._matrix.shape[1]

        for i_idx in range(n_internships):
            if total_sim == 0:
                col_score = 0.0
            else:
                neighbour_scores = np.array(
                    [self._matrix[idx, i_idx] for idx in indices[0]]
                )
                col_score = float((sims * neighbour_scores).sum() / total_sim)

            results.append({
                "internship_id": self._idx_internship[i_idx],
                "collaborative_score": max(0.0, min(1.0, col_score)),
            })

        results.sort(key=lambda r: r["collaborative_score"], reverse=True)
        return results

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def save(self, path: str) -> None:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        joblib.dump(self, path)

    @classmethod
    def load(cls, path: str) -> "CollaborativeFilter":
        return joblib.load(path)
