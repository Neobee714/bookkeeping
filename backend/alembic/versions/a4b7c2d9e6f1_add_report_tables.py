"""add_report_tables

财报总结：每用户一条生成设置 report_schedules，生成后的快照 reports。

Revision ID: a4b7c2d9e6f1
Revises: 5c1d9e7a4b32
Create Date: 2026-11-12 15:00:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a4b7c2d9e6f1"
down_revision: Union[str, Sequence[str], None] = "5c1d9e7a4b32"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _offline() -> bool:
    return bool(getattr(op.get_context(), "as_sql", False))


def _table_names() -> set[str]:
    if _offline():
        return set()
    return set(sa.inspect(op.get_bind()).get_table_names())


def _index_names(table: str) -> set[str]:
    if _offline():
        return set()
    return {
        index["name"]
        for index in sa.inspect(op.get_bind()).get_indexes(table)
        if index["name"]
    }


def upgrade() -> None:
    if "report_schedules" not in _table_names():
        op.create_table(
            "report_schedules",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("kind", sa.String(length=16), nullable=False),
            sa.Column("anchor_weekday", sa.Integer(), nullable=False),
            sa.Column("anchor_day", sa.Integer(), nullable=False),
            sa.Column("anchor_hour", sa.Integer(), nullable=False),
            sa.Column(
                "enabled", sa.Boolean(), server_default=sa.false(), nullable=False
            ),
            sa.Column("next_run_at", sa.DateTime(), nullable=True),
            sa.Column("last_period_end", sa.Date(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", name="uq_report_schedules_user_id"),
        )

    schedule_indexes = {
        "ix_report_schedules_id": ["id"],
        "ix_report_schedules_next_run_at": ["next_run_at"],
    }
    existing_schedule_indexes = _index_names("report_schedules")
    for index_name, columns in schedule_indexes.items():
        if index_name not in existing_schedule_indexes:
            op.create_index(index_name, "report_schedules", columns, unique=False)

    if "reports" not in _table_names():
        op.create_table(
            "reports",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("kind", sa.String(length=16), nullable=False),
            sa.Column("label", sa.String(length=32), nullable=False),
            sa.Column("period_start", sa.Date(), nullable=False),
            sa.Column("period_end", sa.Date(), nullable=False),
            sa.Column("generated_at", sa.DateTime(), nullable=False),
            sa.Column("read_at", sa.DateTime(), nullable=True),
            sa.Column("content", sa.Text(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "user_id", "kind", "period_start", name="uq_reports_user_kind_period"
            ),
        )

    report_indexes = {
        "ix_reports_id": ["id"],
        "ix_reports_user_id": ["user_id"],
        "ix_reports_user_generated_at": ["user_id", "generated_at"],
    }
    existing_report_indexes = _index_names("reports")
    for index_name, columns in report_indexes.items():
        if index_name not in existing_report_indexes:
            op.create_index(index_name, "reports", columns, unique=False)


def downgrade() -> None:
    if _offline() or "reports" in _table_names():
        for index_name in (
            "ix_reports_user_generated_at",
            "ix_reports_user_id",
            "ix_reports_id",
        ):
            if _offline() or index_name in _index_names("reports"):
                op.drop_index(index_name, table_name="reports")
        op.drop_table("reports")

    if _offline() or "report_schedules" in _table_names():
        for index_name in (
            "ix_report_schedules_next_run_at",
            "ix_report_schedules_id",
        ):
            if _offline() or index_name in _index_names("report_schedules"):
                op.drop_index(index_name, table_name="report_schedules")
        op.drop_table("report_schedules")
