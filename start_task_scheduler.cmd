@echo off
setlocal

set "APP_DIR=%~dp0"
set "LOG_DIR=%APP_DIR%logs"
set "OUT_LOG=%LOG_DIR%\task-scheduler.out.log"
set "ERR_LOG=%LOG_DIR%\task-scheduler.err.log"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

cd /d "%APP_DIR%"

echo [%date% %time%] Starting AvgExpert Gateway from "%APP_DIR%" >> "%OUT_LOG%"

call npm.cmd run rebuild:native >> "%OUT_LOG%" 2>> "%ERR_LOG%"
if errorlevel 1 (
  echo [%date% %time%] Failed to rebuild native dependencies. >> "%ERR_LOG%"
  exit /b 1
)

call npm.cmd start >> "%OUT_LOG%" 2>> "%ERR_LOG%"
exit /b %errorlevel%
