@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "PORT=5178"
set "NO_OPEN=1"
set "BUNDLED_NODE=%~dp0runtime\node.exe"

if not exist "%~dp0server.js" (
  echo [错误] 没有找到 server.js。
  echo.
  echo 请不要在压缩包里面直接双击运行。
  echo 正确步骤：
  echo 1. 右键 local-helper-windows.zip
  echo 2. 选择“全部解压缩”
  echo 3. 进入解压后的文件夹
  echo 4. 再双击 start-local-helper-windows
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0public" (
  echo [错误] 文件不完整，没有找到 public 文件夹。
  echo 请重新下载 Windows 助手，并先“全部解压缩”后再运行。
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
