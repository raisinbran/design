@echo off
cd /d "%~dp0"
if not exist node_modules call npm ci
rem Newer npm skips Electron's install script, which downloads the app binary.
if not exist node_modules\electron\path.txt call node node_modules\electron\install.js
call npm start
if errorlevel 1 pause
