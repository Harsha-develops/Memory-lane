@echo off
cd /d "%~dp0"
"backend\.venv\Scripts\python.exe" "packaging\build.py"
if errorlevel 1 pause
