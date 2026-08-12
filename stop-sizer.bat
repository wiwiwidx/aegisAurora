@echo off
setlocal

echo Stopping Bybit Sizer...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"
echo Done. Bybit Sizer is stopped.
timeout /t 2 >nul
