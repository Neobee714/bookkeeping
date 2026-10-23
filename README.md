# 拾光（Bookkeeping）

## Overview

This repository contains an Android-only React Native bookkeeping app and its API: `mobile/` is the React Native app, `backend/` is the FastAPI API, and `deploy/ci/` contains push-to-deploy scripts for the backend.

## Local development

### Backend

Requirements: Python 3.11+ and PostgreSQL (local or cloud). From `backend/`, create a virtual environment, install dependencies, and configure `.env` from `.env.example`:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set `DATABASE_URL`, `SECRET_KEY`, and the authentication settings in `backend/.env`. Then run migrations and start the API:

```bash
python -m alembic upgrade head
python -m uvicorn app.main:app --reload
```

The local API docs are at `http://127.0.0.1:8000/docs`; health check: `http://127.0.0.1:8000/health`.

### Android app

`mobile/` is a React Native CLI project. Install its npm dependencies, start Metro, and run the Android app using the project scripts. Android Studio, Android SDK tools, and a compatible JDK are needed for Android builds. See [mobile/README.md](mobile/README.md) for the project’s setup commands.

## VPS deployment (backend)

The VPS deployment scripts in `deploy/ci/` watch the configured Git branch and deploy backend changes, including database migrations and a health check. Changes to `deploy/nginx.conf` are validated before nginx reload. Mobile app changes are not built or deployed by these scripts. See [deploy/ci/README.md](deploy/ci/README.md) for installation and operations.

The backend can also be run manually with Docker. Configure `backend/.env`, then build and start the container:

```bash
cd backend
cp .env.example .env
# Edit .env with production values
docker build -t bookkeeping-api .
docker run -d --name bookkeeping-api \
  --env-file .env \
  -p 8080:8080 \
  --restart unless-stopped \
  bookkeeping-api
docker exec bookkeeping-api python -m alembic upgrade head
```

Set `DATABASE_URL`, `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, and `REFRESH_TOKEN_EXPIRE_DAYS`. Optional settings include `DB_CONNECT_TIMEOUT_SECONDS` and `CORS_EXTRA_ORIGINS`. Put a TLS nginx reverse proxy in front of the API and verify it with `curl https://api.yourdomain.com/health`.

## Android APK

The APK is built locally on macOS; the VPS never builds it (2 vCPU only, no JDK/Android SDK).

Prerequisites: JDK 17, Android SDK platform/build-tools (matching `mobile/android/build.gradle`), Node 22+.

```bash
cd mobile
npm install
cd android
./gradlew assembleRelease
```

Output: `mobile/android/app/build/outputs/apk/release/app-release.apk`.
The release version lives in `mobile/android/app/build.gradle` (`versionCode` / `versionName`);
`mobile/package.json` is not the release version.

Verify the artifact before publishing:

```bash
aapt2 dump badging app/build/outputs/apk/release/app-release.apk | head
apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
shasum -a 256 app/build/outputs/apk/release/app-release.apk
```

OTA publishing is a separate server-side step: upload the APK, then run
`/opt/bookkeeping/distribute/publish.sh` on the VPS and verify
`https://app.xyvora.me/bookkeeping/info.json`. See `docs/v0.5/DEPLOY-RELEASE.md` for the
reproducible release procedure.
