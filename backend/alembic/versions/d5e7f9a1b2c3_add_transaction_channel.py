"""add transaction channel

Revision ID: d5e7f9a1b2c3
Revises: c3d5e7f9a1b2
Create Date: 2026-11-23 11:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d5e7f9a1b2c3"
down_revision: Union[str, Sequence[str], None] = "c3d5e7f9a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transactions", sa.Column("channel", sa.String(length=20), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("transactions", "channel")
