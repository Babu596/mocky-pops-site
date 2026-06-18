@echo off
cd /d "%~dp0backend"
echo Starting Mocky Pops API on http://127.0.0.1:8000
echo Keep this window open while using the website/admin panel.
echo.
"..\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
pause
