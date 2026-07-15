# 歌曲链接回填工具 - 云端混合版

这个版本用于分享给别人使用：

- 在线网页：网易、酷狗、酷我可直接查询。
- 本地助手：QQ 音乐、汽水音乐 App 这类依赖本机登录态的数据，需要用户下载并启动本地助手。

## 文件结构

```text
music-link-filler-cloud-hybrid/
  web/                    在线网页静态文件
  cloud-functions/api/    EdgeOne Pages Node Functions
  shared/                 云端搜索逻辑
  local-helper/           本地助手源码
  web/downloads/          网页上的助手下载包
```

## 本地预览

双击：

```text
start-preview-windows.bat
```

然后打开：

```text
http://localhost:5280
```

## 在线部署建议

推荐部署到腾讯云 EdgeOne Pages。

部署时上传/关联整个 `music-link-filler-cloud-hybrid` 目录，并确保：

- 静态目录指向 `web`
- Node Functions 目录使用 `cloud-functions`
- `/api/search` 和 `/api/health` 能访问到对应函数

EdgeOne Pages 的 Node Functions 使用 `onRequestGet`、`onRequestPost` 这种导出形式，本项目已经按这个结构放在：

```text
cloud-functions/api/search.js
cloud-functions/api/health.js
```

## 分享给别人

部署完成后，你只需要发在线网址。

对方打开网页后：

- 查网易、酷狗、酷我：直接可用。
- 查 QQ、汽水：页面会提示下载本地助手。

## 本地助手

网页上的下载包在：

```text
web/downloads/local-helper-windows.zip
```

用户下载解压后，双击：

```text
start-local-helper-windows.bat
```

助手默认地址：

```text
http://127.0.0.1:5178
```

在线网页会检测：

```text
http://127.0.0.1:5178/api/status
```

## 为什么 QQ 和汽水不能完全云端化

QQ 音乐搜索和统计现在依赖登录态；汽水音乐依赖用户电脑上的 PC 客户端数据。云端网页无法读取用户本机 Cookie、App 数据和浏览器登录状态。

本地助手的作用是把这些敏感数据留在用户自己的电脑上，只把查询结果返回给当前网页。
