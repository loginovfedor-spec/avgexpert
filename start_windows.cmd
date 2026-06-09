@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   AvgExpert Gateway - Startup (Windows)
echo ========================================
echo.

cd /d "%~dp0"

echo [INFO] Starting API Gateway on port 8080...
echo.
echo ========================================
echo   System is LIVE. Press Ctrl+C to stop.
echo ========================================
echo.

call npm.cmd start

exit /b %errorlevel%
