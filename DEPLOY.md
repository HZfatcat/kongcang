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

#### 3.1 使用部署脚本（推荐）

**下载并运行部署脚本：**
```bash
# 下载部署脚本
curl -O https://gitcode.com/GitCodeKefu/kefumonitor/raw/main/deploy.sh
chmod +x deploy.sh

# 运行部署脚本（交互模式）
./deploy.sh
```

**部署脚本功能：**
| 选项 | 命令 | 说明 |
|------|------|------|
| 1 | `./deploy.sh install` | 首次部署 |
| 2 | `./deploy.sh update` | 更新部署 |
| 3 | `./deploy.sh status` | 查看服务状态 |
| 4 | `./deploy.sh logs` | 查看日志 |
| 5 | `./deploy.sh stop` | 停止服务 |
| 6 | `./deploy.sh backup` | 备份数据库 |

**首次部署流程：**
1. 脚本会自动克隆代码到 `/opt/kefumonitor`
2. 复制 `.env.example-pro` 为 `.env` 并提示编辑配置
3. 构建并启动所有 Docker 容器

**更新部署流程：**
```bash
./deploy.sh update
```
脚本会自动拉取最新代码并重新构建启动。

#### 3.2 手动部署

适合自定义部署场景：

```bash
# 克隆代码
git clone https://gitcode.com/GitCodeKefu/kefumonitor.git
cd kefumonitor

# 复制生产环境配置
cp .env.example-pro .env

# 启动生产服务（自动构建镜像并启动）
npm run prod
```

#### 3.3 常用命令

| 命令 | 说明 |
|------|------|
| `npm run prod` | 启动生产环境 |
| `npm run prod:logs` | 查看日志 |
| `npm run prod:down` | 停止服务 |

#### 3.4 更新部署

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker compose -f docker-compose.prod.yml up -d --build
```

#### 3.5 服务地址

| 服务 | 地址 |
|------|------|
| Web | https://kefumonitor.gitcode.com |
| API | https://kefumonitor.gitcode.com/api/v1 |

#### 3.6 Docker 容器

| 容器 | 名称 | 说明 |
|------|------|------|
| postgres | kefu-postgres | PostgreSQL 数据库 |
| redis | kefu-redis | Redis 缓存 |
| api | kefu-api | 后端 API 服务 |
| web | kefu-web | 前端 Web 服务 |

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
