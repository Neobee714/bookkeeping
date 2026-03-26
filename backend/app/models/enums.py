from __future__ import annotations

from enum import Enum


class TransactionType(str, Enum):
    INCOME = "income"
    EXPENSE = "expense"


class CategoryEnum(str, Enum):
    FOOD = "餐饮"
    TRANSPORT = "交通"
    DAILY = "日用"
    ENTERTAINMENT = "娱乐"
    MEDICAL = "医疗"
    EDUCATION = "教育"
    SHOPPING = "购物"
    INCOME = "收入"
    OTHER = "其他"


def enum_values(enum_type: type[Enum]) -> list[str]:
    return [item.value for item in enum_type]
