@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   AvgExpert Local Stack (TEI bge-m3)
echo   PostgreSQL остаётся удалённым
echo ========================================
echo.

cd /d "%~dp0\.."

echo [1/2] Docker: TEI bge-m3 на http://127.0.0.1:8090
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
echo   Gateway:  npm start  (port из .env, default 8200)
echo   PG:       удалённый DATABASE_URL
echo ========================================

exit /b 0
