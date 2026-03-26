"""add_avatar_to_users

Revision ID: b6f8d3a1c2e4
Revises: 77bd578b1b5a
Create Date: 2026-03-26 18:15:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b6f8d3a1c2e4"
down_revision: Union[str, Sequence[str], None] = "77bd578b1b5a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar")
