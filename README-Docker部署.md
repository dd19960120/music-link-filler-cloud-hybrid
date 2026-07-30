# Docker 部署说明

这个 Docker 版本只封装网页端和在线平台接口，不改动原工具逻辑。

## 本机启动

在项目目录执行：

```powershell
docker compose up -d --build
```

启动后打开：

```text
http://localhost:5280/
```

查看运行状态：

```powershell
docker compose ps
```

停止：

```powershell
docker compose down
```

## 单独用 Docker 命令启动

```powershell
docker build -t music-link-filler-cloud-hybrid:latest .
docker run -d --name music-link-filler-cloud-hybrid -p 5280:5280 music-link-filler-cloud-hybrid:latest
```

## 注意

- Docker 容器提供网页和在线查询接口，访问地址是 `http://localhost:5280/`。
- QQ 音乐和汽水音乐依然需要使用者在自己的电脑上启动“本地助手”。
- 本地助手不能放进云端 Docker 里统一代替所有人运行，因为它要读取使用者本机的浏览器/客户端登录状态。
- 如果把 Docker 部署到局域网服务器，其他电脑访问服务器网页时，QQ/汽水仍需要在各自电脑启动本地助手。
