@echo off
setlocal
cd /d "%~dp0"

call "%~dp0stop-sizer.bat"
start "Bybit Sizer" "%~dp0start.bat"
