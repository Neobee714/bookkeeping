"""drop transaction item field (fold into note)

「吃了什么 / 项目」字段下线：先把存量 item 合并进备注（备注为空则直接搬过去，
否则排成「项目 · 备注」），再把 transactions.item 与整理批次里的 old_item/new_item 删掉。
备注是消费明细，不再单独拆项目维度。

Revision ID: b7c4d9e2a610
Revises: d8e2f4a6b9c1
Create Date: 2026-11-16 10:00:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "b7c4d9e2a610"
down_revision = "d8e2f4a6b9c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 先保数据：把 item 并进 note，并标记为已整理的备注，避免又出现在「整理旧备注」里。
    op.execute(
        sa.text(
            """
            UPDATE transactions
               SET note = CASE
                       WHEN note IS NULL OR trim(note) = '' THEN substr(trim(item), 1, 255)
                       ELSE substr(trim(item) || ' · ' || trim(note), 1, 255)
                   END,
                   note_kind = 'evaluation'
             WHERE item IS NOT NULL
               AND trim(item) <> ''
            """
        )
    )
    op.drop_column("transactions", "item")
    op.drop_column("note_cleanup_items", "old_item")
    op.drop_column("note_cleanup_items", "new_item")


def downgrade() -> None:
    # 只恢复列结构；备注里的项目文本不会自动拆回（旧版本也读不到这些值）。
    op.add_column(
        "transactions", sa.Column("item", sa.String(length=50), nullable=True)
    )
    op.add_column(
        "note_cleanup_items",
        sa.Column("old_item", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "note_cleanup_items",
        sa.Column("new_item", sa.String(length=50), nullable=True),
    )
