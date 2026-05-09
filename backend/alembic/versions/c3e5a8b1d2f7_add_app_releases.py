"""add_app_releases

Revision ID: c3e5a8b1d2f7
Revises: b7c8d9e0f1a2
Create Date: 2026-05-09 12:00:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c3e5a8b1d2f7"
down_revision: Union[str, Sequence[str], None] = "b7c8d9e0f1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "app_releases",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("version", sa.String(length=32), nullable=False),
        sa.Column("bundle_filename", sa.String(length=255), nullable=False),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("bundle_size", sa.Integer(), nullable=False),
        sa.Column("changelog", sa.Text(), nullable=False, server_default=""),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_app_releases_id"), "app_releases", ["id"], unique=False)
    op.create_index(op.f("ix_app_releases_version"), "app_releases", ["version"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_app_releases_version"), table_name="app_releases")
    op.drop_index(op.f("ix_app_releases_id"), table_name="app_releases")
    op.drop_table("app_releases")
