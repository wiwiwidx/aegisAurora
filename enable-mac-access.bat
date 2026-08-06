@echo off
setlocal
cd /d "%~dp0"

where tailscale >nul 2>nul
if errorlevel 1 (
  echo Tailscale is not installed yet.
  echo Install it on both Windows and Mac, sign in to the same Tailscale account,
  echo then run this file again.
  pause
  exit /b 1
)

echo Creating private HTTPS access to Bybit Sizer for your Tailscale devices...
tailscale serve --https=443 http://127.0.0.1:8787
if errorlevel 1 (
  echo.
  echo Could not enable private access. Make sure Tailscale is connected first.
  pause
  exit /b 1
)

echo.
echo Ready. The private Sizer URL is shown below:
tailscale serve status
pause
