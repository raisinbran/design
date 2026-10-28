@echo off
cd /d "%~dp0..\.."
call npm run start:processor
if errorlevel 1 pause
