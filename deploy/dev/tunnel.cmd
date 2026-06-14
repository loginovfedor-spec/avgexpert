@echo off
REM SSH tunnels: laptop -> pilot Docker (PG, TEI embed/rerank, Llama)
REM Usage:
REM   set PILOT=user@203.0.113.10
REM   deploy\dev\tunnel.cmd
REM Keep this window open while npm start runs on the laptop.

if "%PILOT%"=="" (
  echo ERROR: set PILOT=user@host
  echo Example: set PILOT=user@203.0.113.10
  exit /b 1
)

set "LOCAL_PG_PORT=5433"
set "LOCAL_TEI_PORT=8090"
set "LOCAL_RERANK_PORT=8091"
set "LOCAL_LLAMA_PORT=8201"
if not "%SSH_PORT%"=="" set "SSH_PORT_ARG=-p %SSH_PORT%"

echo === AvgExpert dev-remote tunnels ===
echo Pilot: %PILOT%
echo Local: PG %LOCAL_PG_PORT%, TEI %LOCAL_TEI_PORT%, rerank %LOCAL_RERANK_PORT%, Llama %LOCAL_LLAMA_PORT%
echo Press Ctrl+C to close tunnels.
echo.

ssh -N %SSH_PORT_ARG% ^
  -o ServerAliveInterval=30 ^
  -o ServerAliveCountMax=3 ^
  -L %LOCAL_PG_PORT%:127.0.0.1:5432 ^
  -L %LOCAL_TEI_PORT%:127.0.0.1:8090 ^
  -L %LOCAL_RERANK_PORT%:127.0.0.1:8091 ^
  -L %LOCAL_LLAMA_PORT%:127.0.0.1:8201 ^
  %PILOT%
