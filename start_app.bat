@echo off
title AudioSlide AI Launcher
echo ===================================================
echo        Starting AudioSlide AI Ecosystem
echo ===================================================

echo [1/3] Starting Backend Server (FastAPI)...
start "AudioSlide Backend" cmd /k "cd backend && python -m uvicorn main:app --reload --port 8000"

echo [2/3] Starting Frontend Server (Vite)...
start "AudioSlide Frontend" cmd /k "cd frontend && npm run dev -- --port 5173"

echo [3/3] Opening Application in Browser...
timeout /t 5 /nobreak >nul
start http://localhost:5173

echo.
echo Application started successfully!
echo Close this window to keep servers running in background,
echo or close the individual server windows to stop them.
pause
