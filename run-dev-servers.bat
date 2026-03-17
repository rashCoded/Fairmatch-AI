@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

start "FairMatch Backend" cmd /k "cd /d ""%ROOT_DIR%\backend"" && call venv\Scripts\activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
start "FairMatch Frontend" cmd /k "cd /d ""%ROOT_DIR%\frontend"" && npm run dev"

exit /b 0
