@echo off
cd /d "%~dp0\.."
echo Stopping local TEI stack...
call npm.cmd run local:down
exit /b %errorlevel%
