@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "PORT=5178"
set "NO_OPEN=1"
set "BUNDLED_NODE=%~dp0runtime\node.exe"

if exist "%BUNDLED_NODE%" (
  set "NODE_EXE=%BUNDLED_NODE%"
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Node.js was not found.
    echo Please download the full Windows helper package, or install Node.js 22+.
    pause
    exit /b 1
  )
  set "NODE_EXE=node"
)

echo Starting Music Link Filler local helper...
echo Local helper address: http://127.0.0.1:%PORT%
echo Keep this window open, then return to the online page and connect the local helper.
echo.
"%NODE_EXE%" server.js
pause
