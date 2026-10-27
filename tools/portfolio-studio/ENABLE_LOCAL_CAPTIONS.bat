@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Run LAUNCH_PORTFOLIO_STUDIO.bat first to create the local Python environment.
  pause
  exit /b 1
)
echo Preparing the small offline description model...
call ".venv\Scripts\python.exe" setup_offline_descriptions.py
echo Restart Portfolio Studio to use automatic offline descriptions.
pause
endlocal
