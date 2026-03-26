# Bookkeeping App

## Overview
This repository contains a two-person bookkeeping app:
- `frontend/`: React + Vite + TypeScript web app (also used for Android via Capacitor).
- `backend/`: FastAPI + SQLAlchemy API service.

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 20+ and npm
- PostgreSQL (local or cloud)

### 1) Start Backend
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `backend/.env` with your own values:
- `DATABASE_PRIVATE_URL` (Railway recommended) or `DATABASE_URL`
- If you only have `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`, backend can build URL automatically
- `SECRET_KEY`
- `ALGORITHM`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `REFRESH_TOKEN_EXPIRE_DAYS`
- Optional: `DB_CONNECT_TIMEOUT_SECONDS` (default `10`)

Run migrations and start API:
```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Check:
- Swagger: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/health`

### 2) Start Frontend
```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Check:
- App: `http://127.0.0.1:5173`

## Railway Deployment (Backend)
1. Create a Railway service pointing to the `backend/` directory.
2. Railway reads `backend/Dockerfile` and `backend/railway.toml` automatically.
   - Backend listens on `${PORT}` (fallback `8080`) to match Railway networking.
3. Set environment variables in Railway:
   - `DATABASE_PRIVATE_URL` (recommended) or `DATABASE_URL`
   - `SECRET_KEY`
   - `ALGORITHM`
   - `ACCESS_TOKEN_EXPIRE_MINUTES`
   - `REFRESH_TOKEN_EXPIRE_DAYS`
   - Optional: `DB_CONNECT_TIMEOUT_SECONDS`
   - Optional: `CORS_EXTRA_ORIGINS` (comma-separated origins)
4. After deployment, run migration once in Railway shell:
```bash
python -m alembic upgrade head
```
5. Verify `https://<your-railway-domain>/health` returns success.

## Vercel Deployment (Frontend)
1. Import this repository in Vercel.
2. Vercel uses root `vercel.json`:
   - Build command: `npm --prefix frontend install && npm --prefix frontend run build`
   - Output directory: `frontend/dist`
3. Add environment variable in Vercel:
   - `VITE_API_URL=https://<your-railway-domain>`
   - Optional: `VITE_API_TIMEOUT_MS=30000` (increase if backend cold starts slowly)
4. Deploy and verify the app can call backend APIs.

## Android APK Build (Capacitor)

### Manual prerequisites (required)
- Install Android Studio.
- Install Android SDK platform + build-tools + command-line tools.
- Install JDK 17.
- Configure `JAVA_HOME` and Android SDK environment variables.
- `JAVA_HOME` must point to the JDK root folder (example: `C:\Program Files\Java\jdk-17`), not `...\bin\java.exe`.
- Accept Android SDK licenses.

### Build commands
From `frontend/`:
```powershell
npm install
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleRelease
```

Release APK output:
`frontend/android/app/build/outputs/apk/release/app-release.apk`

### Optional helper script
If you use Git Bash/WSL:
```bash
npm run build:apk
```

## Notes
- Production API URL is injected at build time by `VITE_API_URL`.
- Frontend request timeout defaults to 30s and can be overridden by `VITE_API_TIMEOUT_MS`.
- For mobile live reload during local debugging, set `CAP_SERVER_URL` before `npx cap sync android`.
- CORS already allows:
  - `https://bookkeeping.neobee.top`
  - `capacitor://localhost`
  - local development origins.
