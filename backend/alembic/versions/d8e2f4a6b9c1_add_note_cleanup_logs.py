"""add note cleanup batches and undo items

Revision ID: d8e2f4a6b9c1
Revises: c7f1a2b3d4e5
Create Date: 2026-11-12 16:40:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "d8e2f4a6b9c1"
down_revision = "c7f1a2b3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "note_cleanup_batches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("batch_key", sa.String(length=64), nullable=True),
        sa.Column(
            "affected_count", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("undone_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "batch_key", name="uq_note_cleanup_batches_user_key"
        ),
    )
    op.create_index(
        "ix_note_cleanup_batches_user_id",
        "note_cleanup_batches",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "note_cleanup_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=False),
        sa.Column("old_merchant", sa.String(length=50), nullable=True),
        sa.Column("old_item", sa.String(length=50), nullable=True),
        sa.Column("old_note", sa.String(length=255), nullable=True),
        sa.Column("old_note_kind", sa.String(length=12), nullable=True),
        sa.Column("new_merchant", sa.String(length=50), nullable=True),
        sa.Column("new_item", sa.String(length=50), nullable=True),
        sa.Column("new_note", sa.String(length=255), nullable=True),
        sa.Column("new_note_kind", sa.String(length=12), nullable=True),
        sa.ForeignKeyConstraint(
            ["batch_id"], ["note_cleanup_batches.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["transaction_id"], ["transactions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_note_cleanup_items_batch_id",
        "note_cleanup_items",
        ["batch_id"],
        unique=False,
    )
    op.create_index(
        "ix_note_cleanup_items_transaction_id",
        "note_cleanup_items",
        ["transaction_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_note_cleanup_items_transaction_id", table_name="note_cleanup_items")
    op.drop_index("ix_note_cleanup_items_batch_id", table_name="note_cleanup_items")
    op.drop_table("note_cleanup_items")
    op.drop_index("ix_note_cleanup_batches_user_id", table_name="note_cleanup_batches")
    op.drop_table("note_cleanup_batches")
