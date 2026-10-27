@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv
  if errorlevel 1 (
    echo Python 3 installation required.
    pause
    exit /b 1
  )
)
call ".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
  echo Dependencies could not be installed.
  pause
  exit /b 1
)
call ".venv\Scripts\python.exe" setup_offline_descriptions.py
call ".venv\Scripts\python.exe" photo_studio.py
if errorlevel 1 pause
endlocal
