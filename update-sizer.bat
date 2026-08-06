@echo off
setlocal
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo Git is not installed. Install Git for Windows from https://git-scm.com/download/win and run this file again.
  pause
  exit /b 1
)

echo Downloading the latest Bybit Sizer version...
git pull --ff-only
if errorlevel 1 (
  echo.
  echo Update stopped. Do not delete .env - it contains your local API keys.
  pause
  exit /b 1
)

echo Restarting Bybit Sizer...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"
start "Bybit Sizer" "%~dp0start.bat"

echo.
echo Done. The latest version is starting in a new window.
timeout /t 2 >nul
