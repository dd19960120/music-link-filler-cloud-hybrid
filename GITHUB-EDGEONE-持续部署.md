# GitHub + EdgeOne Pages 持续部署

目标：

```text
本地改代码 -> 推送到 GitHub -> EdgeOne Pages 自动部署 -> 分享网址不变
```

## 1. 创建 GitHub 仓库

1. 打开 GitHub。
2. 新建仓库。
3. 仓库名建议：

```text
music-link-filler-cloud-hybrid
```

4. 建议选择 Private 或 Public 均可。
5. 不要勾选自动生成 README，因为本项目已经有 README。

## 2. 上传项目

如果电脑没有安装 Git，可以先用 GitHub 网页上传：

1. 打开新仓库。
2. 点击 `uploading an existing file`。
3. 把本文件夹里的所有内容上传。
4. 提交到 `main` 分支。

推荐上传整个文件夹内容：

```text
cloud-functions/
local-helper/
shared/
web/
.github/
.gitignore
package.json
preview-server.js
README.md
README-部署说明.md
GITHUB-EDGEONE-持续部署.md
start-preview-windows.bat
```

不要只上传 zip 文件。

## 3. EdgeOne Pages 连接 GitHub

1. 打开腾讯云 EdgeOne Pages。
2. 新建 Pages 项目。
3. 选择从 Git 仓库导入。
4. 授权 GitHub。
5. 选择仓库：

```text
music-link-filler-cloud-hybrid
```

## 4. EdgeOne 构建设置

本项目是静态页面 + Functions 混合结构。

建议配置：

```text
构建命令：留空
输出目录：web
Functions 目录：cloud-functions
Node 版本：22
```

如果 EdgeOne 页面没有单独的 Functions 目录选项，就先部署静态目录 `web`，然后按平台提示调整函数目录。

## 5. 部署后测试

部署完成后，测试：

```text
https://你的域名/api/health
```

应返回：

```json
{"ok":true,"mode":"cloud"}
```

再打开首页，搜索：

```text
Bad Girl Good Girl miss A
```

网易结果应显示收藏和评论。

## 6. 以后怎么更新

以后只需要更新 GitHub 仓库。

EdgeOne Pages 会自动检测 `main` 分支变化并重新部署。

如果你用 GitHub 网页上传：

1. 打开仓库。
2. 找到要改的文件。
3. 点击编辑或上传新文件。
4. Commit 到 `main`。
5. 等 EdgeOne 自动部署完成。

如果你安装了 Git：

```bash
git add .
git commit -m "update"
git push
```

## 7. 本地助手下载

网页中提供的下载文件在：

```text
web/downloads/local-helper-windows.zip
```

如果更新了 `local-helper/`，需要重新生成这个 zip，并提交到仓库。
