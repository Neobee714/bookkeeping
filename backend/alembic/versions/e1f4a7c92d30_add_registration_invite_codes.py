"""add_registration_invite_codes

Revision ID: e1f4a7c92d30
Revises: b6f8d3a1c2e4
Create Date: 2026-03-26 23:25:00.000000

"""

from __future__ import annotations

import secrets
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e1f4a7c92d30"
down_revision: Union[str, Sequence[str], None] = "b6f8d3a1c2e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
CODE_LENGTH = 8


def _generate_code(existing_codes: set[str]) -> str:
    while True:
        code = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))
        if code not in existing_codes:
            existing_codes.add(code)
            return code


def upgrade() -> None:
    op.add_column("users", sa.Column("reg_invite_code", sa.String(length=8), nullable=True))
    op.add_column("users", sa.Column("invited_by", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_users_invited_by_users",
        "users",
        "users",
        ["invited_by"],
        ["id"],
        ondelete="SET NULL",
    )

    connection = op.get_bind()
    existing_codes: set[str] = set()
    rows = connection.execute(sa.text("SELECT id FROM users ORDER BY id ASC")).fetchall()
    for row in rows:
        code = _generate_code(existing_codes)
        connection.execute(
            sa.text("UPDATE users SET reg_invite_code = :code WHERE id = :user_id"),
            {"code": code, "user_id": row.id},
        )

    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("reg_invite_code", existing_type=sa.String(length=8), nullable=False)
        batch_op.create_index(batch_op.f("ix_users_reg_invite_code"), ["reg_invite_code"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index(batch_op.f("ix_users_reg_invite_code"))
    op.drop_constraint("fk_users_invited_by_users", "users", type_="foreignkey")
    op.drop_column("users", "invited_by")
    op.drop_column("users", "reg_invite_code")
