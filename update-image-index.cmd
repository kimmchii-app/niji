@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-image-index.ps1"
if errorlevel 1 exit /b %errorlevel%
