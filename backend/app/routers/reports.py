from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.response import success_response
from app.core.security import get_current_user
from app.models.report import Report, ReportSchedule
from app.models.user import User
from app.schemas.report import ReportKind, ReportSettingsRequest
from app.services.report_periods import beijing_now, period_bounds
from app.services.report_periods import next_run_at as compute_next_run_at
from app.services.reports import ensure_report

router = APIRouter(prefix="/reports", tags=["reports"])

BEIJING_TZ = timezone(timedelta(hours=8))
DEFAULT_KIND = "monthly"
DEFAULT_ANCHOR_DAY = 1
DEFAULT_ANCHOR_HOUR = 9
DEFAULT_LIMIT = 30
MAX_LIMIT = 100


def _beijing_iso(value: datetime | None) -> str | None:
    """库里存的是北京时间 naive datetime，输出补 +08:00。"""
    if value is None:
        return None
    return value.replace(tzinfo=BEIJING_TZ).isoformat()


def _load_content(report: Report) -> dict[str, Any]:
    try:
        parsed = json.loads(report.content)
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _default_settings() -> dict[str, Any]:
    return {
        "exists": False,
        "enabled": False,
        "kind": DEFAULT_KIND,
        "anchor_weekday": None,
        "anchor_day": DEFAULT_ANCHOR_DAY,
        "anchor_hour": DEFAULT_ANCHOR_HOUR,
        "next_run_at": None,
        "last_period_end": None,
    }


def _serialize_settings(schedule: ReportSchedule | None) -> dict[str, Any]:
    if schedule is None:
        return _default_settings()

    is_weekly = schedule.kind == "weekly"
    return {
        "exists": True,
        "enabled": schedule.enabled,
        "kind": schedule.kind,
        "anchor_weekday": schedule.anchor_weekday if is_weekly else None,
        # 周报固定存 1，保持一致返回整数（App 端类型为 number）。
        "anchor_day": schedule.anchor_day,
        "anchor_hour": schedule.anchor_hour,
        # 禁用时一定为空（即使库里有历史残留值）。
        "next_run_at": (
            _beijing_iso(schedule.next_run_at) if schedule.enabled else None
        ),
        "last_period_end": (
            schedule.last_period_end.isoformat() if schedule.last_period_end else None
        ),
    }


def _serialize_detail(report: Report) -> dict[str, Any]:
    return {
        "id": report.id,
        "kind": report.kind,
        "label": report.label,
        "period_start": report.period_start.isoformat(),
        "period_end": report.period_end.isoformat(),
        "generated_at": _beijing_iso(report.generated_at),
        "read_at": _beijing_iso(report.read_at),
        "content": _load_content(report),
    }


def _serialize_list_item(report: Report, content: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": report.id,
        "kind": report.kind,
        "label": report.label,
        "period_start": report.period_start.isoformat(),
        "period_end": report.period_end.isoformat(),
        "generated_at": _beijing_iso(report.generated_at),
        "total_income": content.get("total_income", 0.0),
        "total_expense": content.get("total_expense", 0.0),
        "balance": content.get("balance", 0.0),
        "transaction_count": content.get("transaction_count", 0),
        "read_at": _beijing_iso(report.read_at),
    }


def _get_schedule(db: Session, user_id: int) -> ReportSchedule | None:
    return db.scalar(
        select(ReportSchedule).where(ReportSchedule.user_id == user_id)
    )


def _get_owned_report(db: Session, report_id: int, user_id: int) -> Report:
    report = db.scalar(
        select(Report).where(Report.id == report_id, Report.user_id == user_id)
    )
    if report is None:
        # 别人的报告同样返回 404，不泄露存在性。
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="财报不存在",
        )
    return report


@router.get("/settings")
def get_report_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    schedule = _get_schedule(db, current_user.id)
    return success_response(data=_serialize_settings(schedule))


@router.put("/settings")
def update_report_settings(
    payload: ReportSettingsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    schedule = _get_schedule(db, current_user.id)
    if schedule is None:
        schedule = ReportSchedule(user_id=current_user.id)
        db.add(schedule)

    is_weekly = payload.kind == "weekly"
    schedule.kind = payload.kind
    schedule.anchor_weekday = payload.anchor_weekday if is_weekly else 1
    schedule.anchor_day = 1 if is_weekly else int(payload.anchor_day or DEFAULT_ANCHOR_DAY)
    schedule.anchor_hour = payload.anchor_hour
    schedule.enabled = payload.enabled
    schedule.next_run_at = (
        compute_next_run_at(
            payload.kind,
            payload.anchor_weekday,
            payload.anchor_day,
            payload.anchor_hour,
            beijing_now(),
        )
        if payload.enabled
        else None
    )

    db.commit()
    db.refresh(schedule)
    return success_response(data=_serialize_settings(schedule), message="财报设置已保存")


@router.get("")
def list_reports(
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    reports = list(
        db.scalars(
            select(Report)
            .where(Report.user_id == current_user.id)
            .order_by(Report.generated_at.desc(), Report.id.desc())
            .limit(limit)
        ).all()
    )
    unread_count = int(
        db.scalar(
            select(func.count(Report.id)).where(
                Report.user_id == current_user.id,
                Report.read_at.is_(None),
            )
        )
        or 0
    )
    total = int(
        db.scalar(
            select(func.count(Report.id)).where(Report.user_id == current_user.id)
        )
        or 0
    )

    return success_response(
        data={
            "unread_count": unread_count,
            "total": total,
            "items": [_serialize_list_item(report, _load_content(report)) for report in reports],
        }
    )


@router.post("/generate-now")
def generate_now(
    kind: ReportKind | None = Query(
        default=None, description="临时指定周期；不传则用当前设置"
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    schedule = _get_schedule(db, current_user.id)
    selected_kind = kind or (schedule.kind if schedule is not None else DEFAULT_KIND)
    try:
        start, end = period_bounds(selected_kind, beijing_now().date())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="财报周期设置无效",
        ) from exc

    report = ensure_report(db, current_user.id, selected_kind, start, end)
    return success_response(data=_serialize_detail(report), message="财报已生成")


@router.get("/{report_id}")
def get_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    report = _get_owned_report(db, report_id, current_user.id)
    return success_response(data=_serialize_detail(report))


@router.post("/{report_id}/read")
def mark_report_read(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    report = _get_owned_report(db, report_id, current_user.id)
    if report.read_at is None:
        report.read_at = beijing_now()
        db.commit()
        db.refresh(report)

    return success_response(
        data={"id": report.id, "read_at": _beijing_iso(report.read_at)},
        message="财报已读",
    )
