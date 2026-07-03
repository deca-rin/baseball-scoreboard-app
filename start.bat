@echo off
cd /d "%~dp0"
echo Starting baseball scoreboard local server...
echo Keep this window open. Closing it stops the server.
echo.

rem Stop a previous server still holding port 8080
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8080 " ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1

rem Locate node.exe: default install path, else fall back to PATH
set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

rem Open the browser a couple seconds after the server boots
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8080/index.html"

echo Open http://localhost:8080/index.html in your browser.
echo.

rem Run the server in this window; it keeps running here
"%NODE_EXE%" local-server.js

echo.
echo Server stopped. Press any key to close.
pause >nul
