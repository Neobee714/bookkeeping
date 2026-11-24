"""create bill mailboxes

Revision ID: e7a9c1d3f5b7
Revises: d5e7f9a1b2c3
Create Date: 2026-11-23 12:05:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e7a9c1d3f5b7"
down_revision: Union[str, Sequence[str], None] = "d5e7f9a1b2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bill_mailboxes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=10), nullable=False),
        sa.Column("host", sa.String(length=80), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(length=120), nullable=False),
        sa.Column("password_enc", sa.String(length=512), nullable=False),
        sa.Column("folder", sa.String(length=40), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("last_uid", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("uidvalidity", sa.Integer(), nullable=True),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.String(length=12), nullable=True),
        sa.Column("last_error", sa.String(length=255), nullable=True),
        sa.Column("last_summary", sa.String(length=120), nullable=True),
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
        sa.UniqueConstraint("user_id", name="uq_bill_mailboxes_user"),
    )
    op.create_index(op.f("ix_bill_mailboxes_id"), "bill_mailboxes", ["id"], unique=False)
    op.create_index(
        op.f("ix_bill_mailboxes_user_id"), "bill_mailboxes", ["user_id"], unique=True
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_bill_mailboxes_user_id"), table_name="bill_mailboxes")
    op.drop_index(op.f("ix_bill_mailboxes_id"), table_name="bill_mailboxes")
    op.drop_table("bill_mailboxes")
