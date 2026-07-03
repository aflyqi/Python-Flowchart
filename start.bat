@echo off
REM Start the Python Flowchart tool
echo === Python Flowchart Tool ===
echo.

REM Check if frontend is built
if not exist "frontend\dist\index.html" (
    echo [!] Frontend not built. Building...
    cd frontend
    call npm install
    call npm run build
    cd ..
)

echo [OK] Starting server at http://localhost:8765
echo.
python server.py
pause
