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
  echo Created .env. Add your read-only Bybit API key and secret, save it, then run this file again.
  start "" notepad ".env"
  pause
  exit /b 0
)

echo Adding Bybit Sizer to Windows startup...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$folder = (Get-Location).Path; $startup = [Environment]::GetFolderPath('Startup'); $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup 'Bybit Sizer Server.lnk')); $shortcut.TargetPath = (Join-Path $folder 'start-server-hidden.vbs'); $shortcut.WorkingDirectory = $folder; $shortcut.Save()"

start "Bybit Sizer" "%~dp0start-server-hidden.vbs"
echo.
echo Done. The server now starts automatically when you sign in to Windows.
echo Keep this laptop awake and connected to power when you want the server available.
pause
