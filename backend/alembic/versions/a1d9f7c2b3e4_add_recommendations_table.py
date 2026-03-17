"""add_recommendations_table

Revision ID: a1d9f7c2b3e4
Revises: 6b39fb59d352
Create Date: 2026-03-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1d9f7c2b3e4"
down_revision: Union[str, Sequence[str], None] = "6b39fb59d352"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "recommendations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("internship_id", sa.Integer(), nullable=False),
        sa.Column("content_score", sa.Float(), nullable=True),
        sa.Column("collaborative_score", sa.Float(), nullable=True),
        sa.Column("affirmative_score", sa.Float(), nullable=True),
        sa.Column("final_score", sa.Float(), nullable=True),
        sa.Column("matched_skills", sa.ARRAY(sa.String()), nullable=True),
        sa.Column("missing_skills", sa.ARRAY(sa.String()), nullable=True),
        sa.Column("score_breakdown", sa.JSON(), nullable=True),
        sa.Column(
            "generated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["internship_id"], ["internships.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "student_id",
            "internship_id",
            name="uq_recommendations_student_internship",
        ),
    )

    op.create_index(op.f("ix_recommendations_id"), "recommendations", ["id"], unique=False)
    op.create_index(
        op.f("ix_recommendations_student_id"),
        "recommendations",
        ["student_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_recommendations_internship_id"),
        "recommendations",
        ["internship_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_recommendations_internship_id"), table_name="recommendations")
    op.drop_index(op.f("ix_recommendations_student_id"), table_name="recommendations")
    op.drop_index(op.f("ix_recommendations_id"), table_name="recommendations")
    op.drop_table("recommendations")