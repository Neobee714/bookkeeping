"""add import rules

Revision ID: c3d5e7f9a1b2
Revises: b7c4d9e2a610
Create Date: 2026-11-23 10:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c3d5e7f9a1b2"
down_revision: Union[str, Sequence[str], None] = "b7c4d9e2a610"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "import_rules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=12), nullable=False),
        sa.Column("merchant_key", sa.String(length=80), nullable=False),
        sa.Column("category", sa.String(length=10), nullable=False),
        sa.Column("hits", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "source", "merchant_key", name="uq_import_rules_user_source_merchant"
        ),
    )
    op.create_index(op.f("ix_import_rules_id"), "import_rules", ["id"], unique=False)
    op.create_index(
        op.f("ix_import_rules_user_id"), "import_rules", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_import_rules_user_id"), table_name="import_rules")
    op.drop_index(op.f("ix_import_rules_id"), table_name="import_rules")
    op.drop_table("import_rules")
