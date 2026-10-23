"""add_transaction_client_id

Revision ID: e2f3a4b5c6d7
Revises: d4e6f7a8b9c0
Create Date: 2026-10-23 14:55:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, Sequence[str], None] = "d4e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("client_id", sa.String(length=64), nullable=True),
    )
    op.create_unique_constraint(
        "uq_transactions_user_client_id",
        "transactions",
        ["user_id", "client_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_transactions_user_client_id",
        "transactions",
        type_="unique",
    )
    op.drop_column("transactions", "client_id")
