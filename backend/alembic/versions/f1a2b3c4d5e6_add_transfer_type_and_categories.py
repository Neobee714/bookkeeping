"""add transfer type and default categories

Revision ID: f1a2b3c4d5e6
Revises: e7a9c1d3f5b7
Create Date: 2026-11-24 15:20:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e7a9c1d3f5b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DEFAULT_ROWS = (
    ("红包", "🧧", "#FF6B6B", "expense"),
    ("转账", "💸", "#5AC8FA", "transfer"),
    ("提现", "🏦", "#607D8B", "transfer"),
)


def upgrade() -> None:
    # type 列原为 VARCHAR(7)，transfer 需要 8 个字符
    op.alter_column(
        "transactions",
        "type",
        existing_type=sa.String(length=7),
        type_=sa.String(length=12),
        existing_nullable=False,
    )

    conn = op.get_bind()
    # categories 表在早期是由 create_all 建的，历史迁移里没有；
    # 全新库上跳过（也就没有用户需要补分类）。
    if "categories" not in sa.inspect(conn).get_table_names():
        return
    for name, icon, color, type_ in DEFAULT_ROWS:
        conn.execute(
            sa.text(
                """
                INSERT INTO categories (user_id, name, icon, color, type, is_default, created_at)
                SELECT u.id, :name, :icon, :color, :type, true, CURRENT_TIMESTAMP
                FROM users u
                WHERE NOT EXISTS (
                    SELECT 1 FROM categories c
                    WHERE c.user_id = u.id AND c.name = :name AND c.type = :type
                )
                """
            ),
            {"name": name, "icon": icon, "color": color, "type": type_},
        )


def downgrade() -> None:
    # 只回收默认分类；列宽不回缩，避免已有 transfer 数据被截断
    conn = op.get_bind()
    if "categories" not in sa.inspect(conn).get_table_names():
        return
    for name, _icon, _color, type_ in DEFAULT_ROWS:
        conn.execute(
            sa.text(
                "DELETE FROM categories WHERE name = :name AND type = :type AND is_default = true"
            ),
            {"name": name, "type": type_},
        )
