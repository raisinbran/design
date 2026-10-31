@echo off
cd /d "%~dp0"
if not exist node_modules call npm ci
call npm start
if errorlevel 1 pause
