@echo off
setlocal

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Bybit Sizer Server.lnk"
if exist "%STARTUP%" (
  del "%STARTUP%"
  echo Auto-start disabled.
) else (
  echo Auto-start was not enabled.
)

echo The Sizer will now run only after you start start.bat manually.
pause
