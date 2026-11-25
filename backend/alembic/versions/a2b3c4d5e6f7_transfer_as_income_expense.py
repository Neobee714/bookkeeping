"""transfer as income/expense categories

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-11-24 18:40:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    if "categories" not in sa.inspect(conn).get_table_names():
        return
    # 转账改为计入收支：补 收入/支出 两档分类
    for type_ in ("expense", "income"):
        conn.execute(
            sa.text(
                """
                INSERT INTO categories (user_id, name, icon, color, type, is_default, created_at)
                SELECT u.id, '转账', '💸', '#5AC8FA', :type, true, CURRENT_TIMESTAMP
                FROM users u
                WHERE NOT EXISTS (
                    SELECT 1 FROM categories c
                    WHERE c.user_id = u.id AND c.name = '转账' AND c.type = :type
                )
                """
            ),
            {"type": type_},
        )
    # 不再使用的 transfer 版「转账」（没有任何账单用它）
    conn.execute(
        sa.text(
            "DELETE FROM categories c WHERE c.name = '转账' AND c.type = 'transfer' "
            "AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.category = '转账' AND t.type = 'transfer')"
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    if "categories" not in sa.inspect(conn).get_table_names():
        return
    conn.execute(
        sa.text("DELETE FROM categories WHERE name = '转账' AND type IN ('expense','income') AND is_default = true")
    )
