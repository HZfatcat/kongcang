# GitCode 客服运营看板（kefumonitor）

用于客服运营数据分析与同步调度的全栈系统。  
核心目标：把 `Udesk` / `驺吾` 第三方数据增量同步到本地数据库，提供高性能查询、可视化看板与可运维的数据同步面板。

## 技术栈

- 后端：`NestJS` + `Prisma` + `PostgreSQL` + `Redis` + `@nestjs/schedule`
- 前端：`React` + `Vite` + `Ant Design` + `ECharts`
- 部署：`Docker Compose`（`postgres` / `redis` / `api` / `web`）
- 仓库结构：`npm workspaces`（`apps/api`、`apps/web`）

## 主要功能

- 运营概览
  - 咨询总量、消息总量、平均消息数、客服人数、已评分咨询、平均满意度
  - 客服每日趋势图（咨询量 + 消息数，双 Y 轴）
  - 支持按人员、按指标勾选过滤，默认展示汇总
  - 客服业务树（默认折叠、按咨询量排序、显示平均消息数）
- 数据同步
  - 手动触发同步
  - 失败记录一键补偿重试
  - 实时同步进度面板（窗口进度、已同步会话/消息、预计剩余）
  - 定时任务配置（启停 + 间隔小时）
  - 已同步汇总（累计会话、累计消息、累计入库记录、失败数、检查点）
  - 历史同步记录（开始/结束、状态、同步条数、说明）
- 人员管理
  - 维护客服人员资料并与 Udesk `agentId` 关联
  - 概览页自动显示人员名称映射
- 企业微信登录
  - 支持 `corp`（开源共创）和 `csdn`（创新乐知）双主体 OAuth 登录
  - 支持企微内置浏览器自动授权 + 普通浏览器扫码登录
  - 登录账号需在人员管理中存在且 `enabled=true`（按 `agentId=企微userid` 映射）

## 项目结构

- `apps/api`：后端服务（NestJS）
- `apps/web`：前端看板（React）
- `apps/api/prisma`：数据库模型与迁移
- `deploy/nginx`：前端 Nginx 配置
- `docker-compose.yml`：容器编排

## 快速开始（推荐 Docker）

1) 准备配置

```bash
cp .env.example .env
```

2) 构建并启动

```bash
docker compose up -d --build
```

3) 访问地址

- 前端：`http://localhost:8080`
- 后端健康检查：`http://localhost:3000/api/v1/health`

4) 查看状态与日志

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f web
```

## 本地开发模式（非 Docker）

1) 安装依赖

```bash
npm install
```

2) 启动数据库与缓存（可复用 Docker）

```bash
docker compose up -d postgres redis
```

3) 初始化 Prisma

```bash
npm run prisma:generate --workspace apps/api
npm run prisma:migrate:dev --workspace apps/api
```

4) 启动前后端

```bash
npm run dev --workspace apps/api
npm run dev --workspace apps/web -- --host localhost --port 5801
```

## 同步机制说明（Udesk）

- 鉴权：支持 `open_api_v1/log_in` 自动换取 token，支持签名参数 `sign_version=v2`
- 数据入口：
  - 会话：`im/sessions/search`
  - 评分：`im/sessions/vote`（可选）
  - 消息：`im/sessions/log`
- 同步策略：
  - 按时间窗口增量同步（默认 `UDESC_SYNC_WINDOW_DAYS=1`）
  - 幂等 `upsert`，避免重复写入
  - 检查点续传（`SyncCheckpoint`）
  - 失败落库（`SyncIssue`）+ 重试补偿
- 调度策略：
  - 心跳 Cron（默认 `SYNC_HEARTBEAT_CRON=*/5 * * * *`）每 5 分钟检查是否到点
  - 实际执行周期由 `SyncConfig.intervalHours` 控制（页面可配置）

## 关键环境变量

- 基础
  - `DATABASE_URL`
  - `REDIS_URL`
  - `PORT`
  - `CORS_ORIGIN`
- Udesk
  - `UDESC_BASE_URL`
  - `UDESC_EMAIL` / `UDESC_PASSWORD` / `UDESC_TOKEN`
  - `UDESC_SYNC_START_DATE`
  - `UDESC_SYNC_WINDOW_DAYS`
  - `UDESC_PROVIDER_MAX_LOOKBACK_DAYS`
- 同步与重试
  - `SYNC_HEARTBEAT_CRON`
  - `SYNC_RETRY_MAX_ATTEMPTS`
  - `SYNC_RETRY_BASE_DELAY_MS`
  - `SYNC_ENABLE_ZOUWU`
- 驺吾
  - `ZOUWU_BASE_URL`（含 context-path，例如 `http://localhost:8090/dev`）
  - `ZOUWU_COOKIE_NAME`（默认 `admin-plus-app-token`）
  - `ZOUWU_APP_TOKEN`
  - `ZOUWU_PROXY_MODE`（`auto`/`on`/`off`，默认 `auto`）
  - `ZOUWU_LONG_TERM_LABEL_NAME`（默认 `长期演进`）
  - `ZOUWU_STATS_DEFAULT_START` / `ZOUWU_STATS_DEFAULT_END`（`yyyy-MM-dd HH:mm:ss`）
- 企业微信登录
  - `WECOM_CORP_CORPID`
  - `WECOM_CORP_SECRET`
  - `WECOM_CSDN_CORPID`
  - `WECOM_CSDN_SECRET`
  - `VITE_WECOM_APPID`
  - `VITE_WECOM_AGENTID`
  - `VITE_WECOM_CSDN_APPID`
  - `VITE_WECOM_CSDN_AGENTID`
  - `VITE_WECOM_REDIRECT_BASE_URL`（可选，需配置为企微应用可信域名，如 `https://your-domain.com`）
  - `AUTH_TOKEN_SECRET`

## 主要接口（节选）

- 健康检查
  - `GET /api/v1/health`
- Udesk 数据
  - `GET /api/v1/udesc/overview`
  - `GET /api/v1/udesc/tree`
  - `GET /api/v1/udesc/sessions`
  - `GET /api/v1/udesc/daily-agent-stats`
- 同步管理
  - `POST /api/v1/sync/run`
  - `GET /api/v1/sync/progress`
  - `GET /api/v1/sync/summary`
  - `GET /api/v1/sync/runs`
  - `GET /api/v1/sync/issues`
  - `POST /api/v1/sync/issues/retry`
  - `GET /api/v1/sync/config`
  - `POST /api/v1/sync/config`
  - `GET /api/v1/sync/zouwu/feedback-stats`（支持 `start`/`end`/`token` 查询参数）
- 人员管理
  - `GET /api/v1/agents`
  - `POST /api/v1/agents/upsert`
  - `DELETE /api/v1/agents/:agentId`
- 企业微信登录
  - `GET /api/v1/auth/wxlogin`
  - `GET /api/v1/auth/csdnwxlogin`
  - `GET /api/v1/auth/getState`

## 常见问题

- `api` 容器启动时报数据库连接 `127.0.0.1` 错误：
  - 请确保使用 `docker-compose.yml` 中容器内网地址（`postgres` / `redis`），不要让容器读取本机回环地址。
- Docker 拉取官方镜像 403：
  - 检查 Docker 镜像加速源，替换不可用镜像源后重试构建。
