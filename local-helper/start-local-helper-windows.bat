@echo off
setlocal
cd /d "%~dp0"

set "PORT=5178"
set "NO_OPEN=1"
set "BUNDLED_NODE=%~dp0runtime\node.exe"
set "LOG_FILE=%~dp0local-helper.log"

echo ================================================
echo Music Link Filler - Local Helper
echo ================================================
echo.
echo Folder: %CD%
echo Log: %LOG_FILE%
echo.

if not exist "%~dp0server.js" (
  echo [ERROR] server.js was not found.
  echo.
  echo Do not run this file inside the ZIP preview.
  echo Please right-click local-helper-windows.zip, choose "Extract All",
  echo open the extracted folder, then double-click start-local-helper-windows.
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0public" (
  echo [ERROR] The public folder was not found.
  echo Please download the helper again, extract the ZIP fully, then run this file.
  echo.
  pause
  exit /b 1
)

if exist "%BUNDLED_NODE%" (
  set "NODE_EXE=%BUNDLED_NODE%"
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Node.js was not found.
    echo Please download the full Windows helper package, or install Node.js 22+.
    echo.
    pause
    exit /b 1
  )
  set "NODE_EXE=node"
)

echo Starting local helper...
echo Local helper address: http://127.0.0.1:%PORT%
echo Keep this window open, then return to the online page and connect the local helper.
echo.
echo If startup fails, send the file local-helper.log to the tool maker.
echo.

"%NODE_EXE%" server.js > "%LOG_FILE%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo Local helper stopped. Exit code: %EXIT_CODE%
echo Last log lines:
echo ------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-Path '%LOG_FILE%') { Get-Content -LiteralPath '%LOG_FILE%' -Tail 30 }"
echo ------------------------------------------------
pause
exit /b %EXIT_CODE%
