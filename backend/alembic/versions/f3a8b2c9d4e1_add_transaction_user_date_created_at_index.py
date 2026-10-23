"""add_transaction_user_date_created_at_index

Revision ID: f3a8b2c9d4e1
Revises: e2f3a4b5c6d7
Create Date: 2026-10-23 00:00:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "f3a8b2c9d4e1"
down_revision: Union[str, Sequence[str], None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_transactions_user_date_created_at",
        "transactions",
        ["user_id", "date", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_transactions_user_date_created_at", table_name="transactions")
