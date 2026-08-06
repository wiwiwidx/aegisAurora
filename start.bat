@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the current LTS version from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Created .env. Paste your read-only Bybit API key and secret there, save it, then run start.bat again.
  start "" notepad ".env"
  pause
  exit /b 0
)

echo Starting Bybit Sizer. Open: http://127.0.0.1:8787
echo To stop it, press Ctrl+C in this window.
node server.mjs
pause
