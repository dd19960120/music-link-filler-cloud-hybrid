# 歌曲链接回填工具 - 云端混合版

这是一个适合分享和持续更新的版本：

- 在线网页负责网易、酷狗、酷我等公开数据查询。
- 本地助手负责 QQ 音乐、汽水音乐 App 等依赖用户电脑登录态的功能。
- 可以放到 GitHub / GitCode / CODING 等线上仓库，再接 EdgeOne Pages 自动部署。

## 功能

在线可用：

- 网易云音乐：歌曲链接、红心收藏数、评论数
- 酷狗音乐：歌曲链接、评论数
- 酷我音乐：歌曲链接、评论数
- 表格复制、CSV 下载

需要本地助手：

- QQ 音乐：歌曲链接、收藏、在听、评论
- 汽水音乐 App：歌曲链接、点赞、评论、转发

## 本地预览

Windows 双击：

```text
start-preview-windows.bat
```

或运行：

```bash
npm run preview
```

打开：

```text
http://localhost:5280
```

## 本地助手

本地助手目录：

```text
local-helper/
```

Windows 双击：

```text
local-helper/start-local-helper-windows.bat
```

默认地址：

```text
http://127.0.0.1:5178
```

在线网页会自动检测这个地址。

## 部署

推荐：

```text
GitHub 仓库 + 腾讯 EdgeOne Pages
```

部署说明见：

```text
README-部署说明.md
```

EdgeOne 连接仓库后，每次推送代码都会自动重新部署，公网网址不变。
