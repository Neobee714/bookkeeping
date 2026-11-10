"""add_recurring_rules

Revision ID: 02a2d76c9a63
Revises: f3a8b2c9d4e1
Create Date: 2026-11-10 10:00:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "02a2d76c9a63"
down_revision: Union[str, Sequence[str], None] = "f3a8b2c9d4e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _offline() -> bool:
    return bool(getattr(op.get_context(), "as_sql", False))


def _table_names() -> set[str]:
    if _offline():
        return set()
    return set(sa.inspect(op.get_bind()).get_table_names())


def _column_names(table: str) -> set[str]:
    if _offline():
        return set()
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def _index_names(table: str) -> set[str]:
    if _offline():
        return set()
    return {
        index["name"]
        for index in sa.inspect(op.get_bind()).get_indexes(table)
        if index["name"]
    }


def _unique_constraint_names(table: str) -> set[str]:
    if _offline():
        return set()
    return {
        constraint["name"]
        for constraint in sa.inspect(op.get_bind()).get_unique_constraints(table)
        if constraint["name"]
    }


def _foreign_key_names(table: str) -> set[str]:
    if _offline():
        return set()
    return {
        constraint["name"]
        for constraint in sa.inspect(op.get_bind()).get_foreign_keys(table)
        if constraint["name"]
    }


def upgrade() -> None:
    if "recurring_rules" not in _table_names():
        op.create_table(
            "recurring_rules",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
            sa.Column(
                "type",
                sa.Enum("income", "expense", name="transaction_type", native_enum=False),
                nullable=False,
            ),
            sa.Column("category", sa.String(length=10), nullable=False),
            sa.Column("note", sa.String(length=255), nullable=True),
            sa.Column("freq", sa.String(length=10), nullable=False),
            sa.Column("start_date", sa.Date(), nullable=False),
            sa.Column("next_run_date", sa.Date(), nullable=False),
            sa.Column(
                "enabled", sa.Boolean(), server_default=sa.true(), nullable=False
            ),
            sa.Column("last_generated_date", sa.Date(), nullable=True),
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
        )

    recurring_indexes = {
        "ix_recurring_rules_id": ["id"],
        "ix_recurring_rules_user_id": ["user_id"],
        "ix_recurring_rules_next_run_date": ["next_run_date"],
    }
    existing_recurring_indexes = _index_names("recurring_rules")
    for index_name, columns in recurring_indexes.items():
        if index_name not in existing_recurring_indexes:
            op.create_index(index_name, "recurring_rules", columns, unique=False)

    if "recurring_rule_id" not in _column_names("transactions"):
        op.add_column(
            "transactions",
            sa.Column("recurring_rule_id", sa.Integer(), nullable=True),
        )

    if "fk_transactions_recurring_rule_id" not in _foreign_key_names("transactions"):
        op.create_foreign_key(
            "fk_transactions_recurring_rule_id",
            "transactions",
            "recurring_rules",
            ["recurring_rule_id"],
            ["id"],
            ondelete="SET NULL",
        )

    if "uq_transactions_recurring_date" not in _unique_constraint_names("transactions"):
        op.create_unique_constraint(
            "uq_transactions_recurring_date",
            "transactions",
            ["recurring_rule_id", "date"],
        )

    if "ix_transactions_recurring_rule_id" not in _index_names("transactions"):
        op.create_index(
            "ix_transactions_recurring_rule_id",
            "transactions",
            ["recurring_rule_id"],
            unique=False,
        )


def downgrade() -> None:
    if _offline() or "ix_transactions_recurring_rule_id" in _index_names("transactions"):
        op.drop_index("ix_transactions_recurring_rule_id", table_name="transactions")

    if _offline() or "uq_transactions_recurring_date" in _unique_constraint_names(
        "transactions"
    ):
        op.drop_constraint(
            "uq_transactions_recurring_date",
            "transactions",
            type_="unique",
        )

    if _offline() or "fk_transactions_recurring_rule_id" in _foreign_key_names(
        "transactions"
    ):
        op.drop_constraint(
            "fk_transactions_recurring_rule_id",
            "transactions",
            type_="foreignkey",
        )

    if _offline() or "recurring_rule_id" in _column_names("transactions"):
        op.drop_column("transactions", "recurring_rule_id")

    if _offline() or "recurring_rules" in _table_names():
        op.drop_table("recurring_rules")
