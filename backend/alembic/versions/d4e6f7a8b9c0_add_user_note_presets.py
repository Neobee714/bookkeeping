"""add_user_note_presets

Revision ID: d4e6f7a8b9c0
Revises: 67f2f7585bb7
Create Date: 2026-10-07 23:55:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d4e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "67f2f7585bb7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_note_presets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("note", sa.String(length=255), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "note"),
    )
    op.create_index(op.f("ix_user_note_presets_id"), "user_note_presets", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_note_presets_id"), table_name="user_note_presets")
    op.drop_table("user_note_presets")
