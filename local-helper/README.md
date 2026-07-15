# 歌曲链接回填本地助手

这个助手用于在线网页无法直接访问的本机能力：

- QQ 音乐浏览器自动化和登录态
- 汽水音乐 PC 客户端登录态、设备参数和分享页数据

## Windows 使用

如果你是从网页下载的 `local-helper-windows.zip`，压缩包已经内置 Node.js，不需要另外安装 Node。

1. 解压 `local-helper-windows.zip`。
2. 双击 `start-local-helper-windows.bat`。
3. 保持弹出的窗口不要关闭。
4. 回到在线网页，点击“连接本地助手”。
5. 如需 QQ 音乐，请在助手打开的 QQ 音乐浏览器窗口里登录 QQ 音乐。
6. 如需汽水音乐，请确保本机已安装并登录汽水音乐 PC 客户端。

如果你是从源码目录运行，而不是下载包运行，则需要自己安装 Node.js 22 或更高版本。

## macOS 使用

macOS 当前仍需要自行安装 Node.js 22 或更高版本。

第一次运行可能需要在终端执行：

```bash
chmod +x start-local-helper-macos.command
```

然后双击 `start-local-helper-macos.command`，再回到在线网页点击“连接本地助手”。

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
