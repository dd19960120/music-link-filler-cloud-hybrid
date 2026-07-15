@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PORT=5280
echo 正在启动云端混合版本地预览...
echo 预览地址：http://localhost:5280
node preview-server.js
pause
