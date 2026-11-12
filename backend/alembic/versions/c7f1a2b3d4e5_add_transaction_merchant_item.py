"""add_transaction_merchant_item

v0.18 商家 / 吃了什么 / 评价：transactions 增加三个可空列。
note 语义改为评价；迁移不回填 note_kind，存量备注全部保持 NULL 等待整理。

Revision ID: c7f1a2b3d4e5
Revises: a4b7c2d9e6f1
Create Date: 2026-11-12 18:00:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c7f1a2b3d4e5"
down_revision: Union[str, Sequence[str], None] = "a4b7c2d9e6f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("merchant", sa.String(length=50)),
    ("item", sa.String(length=50)),
    ("note_kind", sa.String(length=12)),
)


def _offline() -> bool:
    return bool(getattr(op.get_context(), "as_sql", False))


def _column_names(table: str) -> set[str]:
    if _offline():
        return set()
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    existing = _column_names("transactions")
    for name, column_type in _COLUMNS:
        if _offline() or name not in existing:
            op.add_column("transactions", sa.Column(name, column_type, nullable=True))


def downgrade() -> None:
    existing = _column_names("transactions")
    to_drop = [
        name
        for name, _column_type in reversed(_COLUMNS)
        if _offline() or name in existing
    ]
    if not to_drop:
        return

    if not _offline() and op.get_bind().dialect.name == "sqlite":
        # SQLite 不能直接 DROP COLUMN（旧版本），用 batch 重建表。
        with op.batch_alter_table("transactions") as batch_op:
            for name in to_drop:
                batch_op.drop_column(name)
    else:
        for name in to_drop:
            op.drop_column("transactions", name)
