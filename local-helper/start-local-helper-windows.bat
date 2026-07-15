@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PORT=5178
set NO_OPEN=1
echo 正在启动歌曲链接回填本地助手...
echo 本地助手地址：http://127.0.0.1:5178
echo 启动后请回到在线网页，点击“连接本地助手”。
node server.js
pause
