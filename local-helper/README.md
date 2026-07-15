# 歌曲链接回填本地助手

这个助手用于在线网页无法直接访问的本机能力：

- QQ 音乐浏览器自动化和登录态
- 汽水音乐 PC 客户端登录态、设备参数和分享数据

## Windows 使用

1. 安装 Node.js。
2. 双击 `start-local-helper-windows.bat`。
3. 回到在线网页，点击“连接本地助手”。
4. 如需 QQ 音乐，在线网页搜索前请先在本地完整版或助手打开的 QQ 浏览器里登录 QQ 音乐。
5. 如需汽水音乐，请确保本机已安装并登录汽水音乐 PC 客户端。

## macOS 使用

1. 安装 Node.js。
2. 第一次运行可能需要在终端执行：

```bash
chmod +x start-local-helper-macos.command
```

3. 双击 `start-local-helper-macos.command`。
4. 回到在线网页，点击“连接本地助手”。

## 本地地址

助手默认监听：

```text
http://127.0.0.1:5178
```

在线网页会访问：

```text
http://127.0.0.1:5178/api/status
http://127.0.0.1:5178/api/search
```

数据只在用户自己的电脑上处理，不会把 QQ 或汽水 Cookie 上传到云端。
