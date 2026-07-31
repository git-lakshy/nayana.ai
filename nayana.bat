@echo off
title nayana.ai launcher
cd /d "%~dp0"

echo.
echo   =============================================
echo    nayana.ai - AI Visibility Engine
echo   =============================================
echo.

REM --- Backend: FastAPI on :8000 (serves API + production frontend from backend\static) ---
start "nayana-backend :8000" cmd /k "cd /d ""%~dp0"" && python -m uvicorn backend.app.main:app --port 8000"

REM --- Frontend: Next.js dev server on :3000 (hot reload for development) ---
start "nayana-frontend :3000" cmd /k "cd /d ""%~dp0frontend"" && npm run dev"

echo   Backend  : http://localhost:8000   (API + built frontend)
echo   Frontend : http://localhost:3000   (dev server, hot reload)
echo.
echo   Two windows opened. Close them (or Ctrl+C inside) to stop.
echo   Tip: after frontend changes, run "npm run build" in frontend\
echo        then copy frontend\out\* into backend\static\ to update :8000.
echo.
