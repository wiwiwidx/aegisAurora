@echo off
setlocal
cd /d "%~dp0"
findstr /b /c:"TELEGRAM_REQUIRE_AUTH=1" .env >nul 2>&1 || (
  echo Run configure-telegram.bat first. The public tunnel stays disabled until Telegram protection is enabled.
  pause
  exit /b 1
)
where tailscale >nul 2>&1 || (
  echo Tailscale CLI was not found. Open the Tailscale app once, then try again.
  pause
  exit /b 1
)
echo Enabling private Aegis Aurora HTTPS address...
echo Approve the Tailscale browser page if it opens.
tailscale funnel --bg 127.0.0.1:8787
echo.
tailscale funnel status
echo.
echo Copy the https:// address above. It is the URL for BotFather's Main Mini App.
pause
