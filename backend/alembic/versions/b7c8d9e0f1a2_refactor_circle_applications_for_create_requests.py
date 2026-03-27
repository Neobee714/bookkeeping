"""refactor_circle_applications_for_create_requests

Revision ID: b7c8d9e0f1a2
Revises: a1d2f3c4b5e6
Create Date: 2026-03-27 14:05:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, Sequence[str], None] = "a1d2f3c4b5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "circle_applications",
        sa.Column("circle_name", sa.String(length=30), nullable=True),
    )
    op.add_column(
        "circle_applications",
        sa.Column("circle_description", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "circle_applications",
        sa.Column("created_circle_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "circle_applications",
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_circle_applications_created_circle_id",
        "circle_applications",
        "circles",
        ["created_circle_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_circle_applications_reviewed_by",
        "circle_applications",
        "users",
        ["reviewed_by"],
        ["id"],
        ondelete="SET NULL",
    )

    op.execute(
        """
        UPDATE circle_applications AS applications
        SET circle_name = circles.name,
            circle_description = circles.description,
            created_circle_id = applications.circle_id
        FROM circles
        WHERE applications.circle_id = circles.id
        """
    )
    op.execute(
        "UPDATE circle_applications SET circle_name = '未命名圈子' WHERE circle_name IS NULL"
    )
    op.alter_column("circle_applications", "circle_name", nullable=False)
    op.drop_index("ix_circle_applications_circle_status", table_name="circle_applications")
    op.create_index(
        "ix_circle_applications_status",
        "circle_applications",
        ["status"],
        unique=False,
    )
    op.drop_column("circle_applications", "circle_id")


def downgrade() -> None:
    op.add_column(
        "circle_applications",
        sa.Column("circle_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_circle_applications_circle_id",
        "circle_applications",
        "circles",
        ["circle_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.execute(
        "UPDATE circle_applications SET circle_id = created_circle_id WHERE created_circle_id IS NOT NULL"
    )
    op.drop_index("ix_circle_applications_status", table_name="circle_applications")
    op.create_index(
        "ix_circle_applications_circle_status",
        "circle_applications",
        ["circle_id", "status"],
        unique=False,
    )
    op.drop_constraint("fk_circle_applications_reviewed_by", "circle_applications", type_="foreignkey")
    op.drop_constraint(
        "fk_circle_applications_created_circle_id",
        "circle_applications",
        type_="foreignkey",
    )
    op.drop_column("circle_applications", "reviewed_by")
    op.drop_column("circle_applications", "created_circle_id")
    op.drop_column("circle_applications", "circle_description")
    op.drop_column("circle_applications", "circle_name")
