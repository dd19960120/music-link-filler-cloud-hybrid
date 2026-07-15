#!/bin/zsh
cd "$(dirname "$0")"
export PORT=5178
export NO_OPEN=1
echo "正在启动歌曲链接回填本地助手..."
echo "本地助手地址：http://127.0.0.1:5178"
echo "启动后请回到在线网页，点击“连接本地助手”。"
node server.js
