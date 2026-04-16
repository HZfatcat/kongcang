# 部署说明

## 三种环境配置

### 1. 开发环境 - 本机启动前后端服务

**前置条件：**
- 本机已安装 PostgreSQL（端口 5432）
- 本机已安装 Redis（端口 6379）

**启动命令：**
```bash
# 复制配置文件
cp .env.example.dev-local .env

# 启动前后端服务
npm run dev
```

**访问地址：**
- Web: http://localhost:5801
- API: http://localhost:3000

---

### 2. 开发环境 - 本机运行 Docker 服务

**启动命令：**
```bash
# 复制配置文件并启动 Docker
npm run dev:docker

# 查看日志
npm run dev:docker:logs

# 停止服务
npm run dev:docker:down
```

**访问地址：**
- Web: http://localhost:8080
- API: http://localhost:3000

---

### 3. 生产环境 - Docker 部署

**启动命令：**
```bash
# 复制配置文件并启动 Docker
npm run prod

# 查看日志
npm run prod:logs

# 停止服务
npm run prod:down
```

**访问地址：**
- Web: https://kefumonitor.gitcode.com
- API: https://kefumonitor.gitcode.com/api/v1

---

## 环境配置文件说明

| 文件 | 用途 | 数据库地址 | Redis 地址 |
|------|------|-----------|-----------|
| `.env.example.dev-local` | 本机开发 | 127.0.0.1:5432 | 127.0.0.1:6379 |
| `.env.example.dev-docker` | 开发 Docker | postgres:5432 | redis:6379 |
| `.env.example-pro` | 生产环境 | postgres:5432 | redis:6379 |

## Docker Compose 文件说明

| 文件 | 用途 | 容器名称后缀 |
|------|------|-------------|
| `docker-compose.dev.yml` | 开发环境 | -dev |
| `docker-compose.prod.yml` | 生产环境 | 无后缀 |

## 数据库初始化

首次启动会自动运行 Prisma 迁移：

```bash
# 手动运行迁移（可选）
cd apps/api
npx prisma migrate deploy
```

## 常见问题

### Q: 如何切换环境？

```bash
# 停止当前环境
npm run dev:docker:down  # 或 npm run prod:down

# 切换到新环境
npm run dev              # 或 npm run dev:docker / npm run prod
```

### Q: 端口被占用怎么办？

修改对应的配置文件：
- 本机开发: `.env` 中修改 `PORT` 和 `apps/web/vite.config.ts` 中端口
- Docker: 修改 `docker-compose.dev.yml` 或 `docker-compose.prod.yml` 中的 ports 映射
