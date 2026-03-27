"""add_circle_applications

Revision ID: a1d2f3c4b5e6
Revises: f7a9c3d4e5b6
Create Date: 2026-03-27 09:55:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1d2f3c4b5e6"
down_revision: Union[str, Sequence[str], None] = "f7a9c3d4e5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "circle_applications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("circle_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["circle_id"], ["circles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_circle_applications_id"),
        "circle_applications",
        ["id"],
        unique=False,
    )
    op.create_index(
        "ix_circle_applications_circle_status",
        "circle_applications",
        ["circle_id", "status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_circle_applications_circle_status", table_name="circle_applications")
    op.drop_index(op.f("ix_circle_applications_id"), table_name="circle_applications")
    op.drop_table("circle_applications")
