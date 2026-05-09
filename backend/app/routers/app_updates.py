from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.admin import is_admin_username
from app.core.config import (
    APP_RELEASES_DIR,
    APP_RELEASES_MAX_BUNDLE_MB,
    APP_RELEASES_PUBLIC_BASE_URL,
)
from app.core.database import get_db
from app.core.response import success_response
from app.core.security import get_current_user
from app.models.app_release import AppRelease
from app.models.user import User

router = APIRouter(prefix="/app-updates", tags=["app-updates"])

VERSION_PATTERN = re.compile(r"^\d+\.\d+\.\d+$")
DOWNLOAD_PATH_PREFIX = "/app-updates/files"


def _require_admin(user: User) -> None:
    if not is_admin_username(user.username):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权限",
        )


def _releases_dir() -> Path:
    if not APP_RELEASES_DIR:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新存储目录未配置",
        )
    path = Path(APP_RELEASES_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _compare_versions(a: str, b: str) -> int:
    pa = [int(x) for x in a.split(".")]
    pb = [int(x) for x in b.split(".")]
    return (pa > pb) - (pa < pb)


def _bundle_url(request: Request, filename: str) -> str:
    if APP_RELEASES_PUBLIC_BASE_URL:
        return f"{APP_RELEASES_PUBLIC_BASE_URL}/{filename}"
    return str(request.url_for("download_bundle", filename=filename))


@router.get("/latest")
def get_latest_release(
    request: Request,
    current: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    latest = db.scalar(
        select(AppRelease)
        .where(AppRelease.is_active.is_(True))
        .order_by(AppRelease.created_at.desc())
    )

    if not latest:
        return success_response(data={"has_update": False})

    current_normalized = (current or "").strip()
    has_update = True
    if current_normalized and VERSION_PATTERN.match(current_normalized):
        has_update = _compare_versions(latest.version, current_normalized) > 0

    return success_response(
        data={
            "has_update": has_update,
            "version": latest.version,
            "url": _bundle_url(request, latest.bundle_filename),
            "checksum": latest.checksum,
            "size": latest.bundle_size,
            "changelog": latest.changelog,
            "released_at": latest.created_at.isoformat() if latest.created_at else None,
        }
    )


@router.get("/files/{filename}", name="download_bundle")
def download_bundle(filename: str):
    # Let FileResponse lazy-import to avoid unused import in list handlers
    from fastapi.responses import FileResponse

    safe_name = os.path.basename(filename)
    if safe_name != filename or not safe_name.endswith(".zip"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在")
    file_path = _releases_dir() / safe_name
    if not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在")
    return FileResponse(
        path=str(file_path),
        media_type="application/zip",
        filename=safe_name,
    )


@router.post("/releases")
async def publish_release(
    request: Request,
    version: str = Form(...),
    changelog: str = Form(""),
    bundle: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    _require_admin(current_user)

    normalized_version = version.strip()
    if not VERSION_PATTERN.match(normalized_version):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="版本号格式应为 X.Y.Z",
        )

    existing = db.scalar(select(AppRelease).where(AppRelease.version == normalized_version))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"版本 {normalized_version} 已发布",
        )

    max_bytes = APP_RELEASES_MAX_BUNDLE_MB * 1024 * 1024
    hasher = hashlib.sha256()
    total_size = 0
    filename = f"bundle-{normalized_version}.zip"
    target_dir = _releases_dir()
    target_path = target_dir / filename
    tmp_path = target_dir / f"{filename}.part"

    try:
        with tmp_path.open("wb") as fp:
            while True:
                chunk = await bundle.read(1024 * 1024)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > max_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"bundle 超过 {APP_RELEASES_MAX_BUNDLE_MB} MB 限制",
                    )
                hasher.update(chunk)
                fp.write(chunk)

        if total_size == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="bundle 文件为空",
            )

        tmp_path.replace(target_path)
    except Exception:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
        raise

    release = AppRelease(
        version=normalized_version,
        bundle_filename=filename,
        checksum=hasher.hexdigest(),
        bundle_size=total_size,
        changelog=changelog.strip(),
        is_active=True,
    )
    db.add(release)
    db.commit()
    db.refresh(release)

    return success_response(
        data={
            "version": release.version,
            "url": _bundle_url(request, release.bundle_filename),
            "checksum": release.checksum,
            "size": release.bundle_size,
            "changelog": release.changelog,
            "released_at": release.created_at.isoformat() if release.created_at else None,
        },
        message="发布成功",
    )


@router.get("/releases")
def list_releases(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    _require_admin(current_user)
    rows = db.scalars(select(AppRelease).order_by(AppRelease.created_at.desc())).all()
    return success_response(
        data=[
            {
                "id": r.id,
                "version": r.version,
                "checksum": r.checksum,
                "size": r.bundle_size,
                "changelog": r.changelog,
                "is_active": r.is_active,
                "released_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    )
