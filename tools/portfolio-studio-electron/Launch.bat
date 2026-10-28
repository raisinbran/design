@echo off
cd /d "%~dp0..\.."
call npm run start:studio
if errorlevel 1 pause
