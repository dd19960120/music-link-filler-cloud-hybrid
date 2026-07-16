# 歌曲链接回填本地助手

这个助手用于在线网页无法直接访问的本机能力：

- QQ 音乐浏览器自动化和登录态
- 汽水音乐 PC 客户端登录态、设备参数和分享页数据

## Windows 使用

如果你是从网页下载的 `local-helper-windows.zip`，压缩包已经内置 Node.js，不需要另外安装 Node。

1. 右键 `local-helper-windows.zip`，选择“全部解压缩”。
2. 进入解压后的文件夹。
3. 双击 `start-local-helper-windows.bat`。
4. 保持弹出的本地助手窗口不要关闭。
5. 回到在线网页，点击“连接本地助手”，也可以直接搜索。

## macOS 使用

macOS 版本也已经内置 Node.js，不需要另外安装 Node。

- Apple Silicon：下载 `local-helper-macos-arm64.zip`，适用于 M1 / M2 / M3 / M4。
- Intel Mac：下载 `local-helper-macos-x64.zip`，适用于老款 Intel Mac。

使用步骤：

1. 双击 zip 解压，进入解压后的文件夹。
2. 双击 `start-local-helper-macos.command`。
3. 保持弹出的终端窗口不要关闭。
4. 回到在线网页，点击“连接本地助手”，也可以直接搜索。

如果 macOS 提示无法打开：

1. 右键 `start-local-helper-macos.command`。
2. 选择“打开”。
3. 在安全提示里再次点“打开”。

如果仍然提示没有执行权限，请打开终端进入该文件夹后执行：

```bash
chmod +x start-local-helper-macos.command
./start-local-helper-macos.command
```

## QQ 音乐

1. 启动本地助手后，回到在线网页。
2. 点击“打开本地助手控制台 / QQ 浏览器”。
3. 在本地助手控制台里点击“打开/连接 QQ 浏览器”。
4. 在打开的 QQ 音乐浏览器窗口里登录 QQ 音乐。
5. 回到在线网页搜索 QQ 音乐。

macOS 版会尝试启动本机的 Google Chrome 或 Microsoft Edge。请先安装其中一个浏览器。

## 汽水音乐

Windows：

1. 电脑上需要安装并登录汽水音乐 PC 客户端。
2. 启动本地助手后，回到在线网页搜索汽水音乐。
3. 本地助手会读取本机汽水客户端里的设备参数和登录状态。

macOS：

- 当前 macOS 包可以运行本地助手和公开平台查询。
- 汽水音乐 macOS 客户端的数据目录还需要单独确认；如需完整汽水支持，请优先使用 Windows 版。

## 注意

- 本地助手窗口一关，搜索功能就不可用，需要重新双击启动。
- 如果直接在压缩包里双击启动文件，可能无法找到 `server.js`。请务必先完整解压。
- 数据只在用户自己的电脑上处理，不会把 QQ 或汽水 Cookie 上传到云端。

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
