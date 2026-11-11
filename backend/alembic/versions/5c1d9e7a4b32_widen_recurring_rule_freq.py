"""widen_recurring_rule_freq

循环记账新增工作日类频率（workday / monthly_last_workday / monthly_nth_workday），
最长 20 字符，原 String(10) 不够。

Revision ID: 5c1d9e7a4b32
Revises: 02a2d76c9a63
Create Date: 2026-11-10 12:30:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5c1d9e7a4b32"
down_revision: Union[str, Sequence[str], None] = "02a2d76c9a63"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TARGET_LENGTH = 24


def _offline() -> bool:
    return bool(getattr(op.get_context(), "as_sql", False))


def _current_length() -> int | None:
    if _offline():
        return None
    inspector = sa.inspect(op.get_bind())
    if "recurring_rules" not in inspector.get_table_names():
        return None
    for column in inspector.get_columns("recurring_rules"):
        if column["name"] == "freq":
            return getattr(column["type"], "length", None)
    return None


def upgrade() -> None:
    current = _current_length()
    if current is None or current >= TARGET_LENGTH:
        return
    op.alter_column(
        "recurring_rules",
        "freq",
        existing_type=sa.String(length=current),
        type_=sa.String(length=TARGET_LENGTH),
        existing_nullable=False,
    )


def downgrade() -> None:
    # 回退到 10 字符前先把工作日类规则降级成每月，避免截断报错。
    op.execute(
        """
        UPDATE recurring_rules
           SET freq = 'monthly'
         WHERE freq IN ('workday', 'monthly_last_workday', 'monthly_nth_workday')
        """
    )
    current = _current_length()
    if current is None or current <= 10:
        return
    op.alter_column(
        "recurring_rules",
        "freq",
        existing_type=sa.String(length=current),
        type_=sa.String(length=10),
        existing_nullable=False,
    )
