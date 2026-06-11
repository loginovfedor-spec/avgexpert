@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   AvgExpert Local Stack (TEI + Llama.cpp)
echo   PostgreSQL остаётся удалённым
echo ========================================
echo.

cd /d "%~dp0\.."

echo [1/2] Docker: TEI + Llama.cpp (Qwen2.5-7B) на :8090 / :8201
call npm.cmd run local:up
if errorlevel 1 (
  echo [ERROR] local:up failed
  exit /b 1
)

echo.
echo [2/2] Smoke embedding
call npm.cmd run local:smoke
if errorlevel 1 (
  echo [ERROR] local:smoke failed
  exit /b 1
)

echo.
echo ========================================
echo   Local stack READY
echo   TEI:      http://127.0.0.1:8090/embed
echo   Llama:    http://127.0.0.1:8201/v1
echo   Gateway:  npm start  (port из .env, default 8200)
echo   Category: Консультант (Local)
echo   PG:       удалённый DATABASE_URL
echo ========================================

exit /b 0
