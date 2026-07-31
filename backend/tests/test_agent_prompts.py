from __future__ import annotations

from datetime import date

from app.agent.prompts import build_system_prompt


def test_system_prompt_includes_voice_accounting_rules() -> None:
    prompt = build_system_prompt()

    assert "智能记账助手" in prompt
    assert "记账意图" in prompt
    assert "search_transactions" in prompt
    assert "create_transaction" in prompt
    assert "📝 已记一笔" in prompt
    assert "{日期}" in prompt
    assert "参照您的记账习惯" in prompt
    assert "一百八" in prompt
    assert "买菜→餐饮" in prompt


def test_system_prompt_keeps_original_rules() -> None:
    prompt = build_system_prompt()

    assert "end_date" in prompt
    assert "开区间" in prompt
    assert "target=self" in prompt
    assert "不要暴露内部 user_id" in prompt
    assert "不能编造金额、日期、分类或账单明细" in prompt


def test_system_prompt_uses_provided_today() -> None:
    prompt = build_system_prompt(today=date(2026, 7, 31))

    assert "2026-07-31" in prompt
