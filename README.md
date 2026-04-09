# 客服运营管理后台（kefumonitor）

用于查看客服业务核心 KPI，支持周期性同步第三方系统数据到本地数据库，解决大范围查询性能问题。

## 技术架构

- 后端：NestJS + Prisma + PostgreSQL + Redis + Schedule
- 前端：React + Vite + Ant Design + ECharts
- 部署：Docker Compose（postgres / redis / api / web）

## 核心能力

- 从 `udesc` 同步会话与满意度相关数据
- 从 `udesc` 同步会话消息明细（咨询详情）
- 从 `驺吾` 同步需求单与进展状态
- 计算 KPI：
  - 用户满意度
  - 咨询转需求后的需求工单完成率
- Dashboard 可按时间范围查询
- 提供手动触发同步接口

## 目录结构

- `apps/api`: 后端服务
- `apps/web`: 前端管理台
- `deploy/nginx`: 前端 Nginx 配置
- `docker-compose.yml`: 一键部署

## 本地开发

1. 复制环境变量

```bash
cp .env.example .env
```

2. 启动基础依赖

```bash
docker compose up -d postgres redis
```

3. 安装依赖

```bash
npm install
```

4. 初始化数据库

```bash
npm run prisma:generate --workspace apps/api
npm run prisma:migrate:dev --workspace apps/api -- --name init
```

5. 启动开发环境

```bash
npm run dev --workspace apps/api
npm run dev --workspace apps/web
```

## Docker 一键部署

```bash
docker compose up -d --build
```

前端默认 `http://localhost:8080`，后端 API 默认 `http://localhost:3000`。

## Udesk 集成说明（已接入签名鉴权）

- 已实现 `open_api_v1/log_in` 自动换取 Token（优先使用 `UDESC_TOKEN`，无则使用 `UDESC_EMAIL` + `UDESC_PASSWORD`）
- 已实现 `open_api_v1` 公共参数签名：`email/timestamp/nonce/sign/sign_version(v2)`
- 已接入 `im/sessions/search` 同步入口（可通过 `UDESC_IM_SESSION_PATH` 覆盖）
- 支持补充 `im/sessions/vote` 评分数据入口（`UDESC_IM_VOTE_PATH`）
- 已接入 `im/sessions/log` 同步入口（可通过 `UDESC_IM_LOG_PATH` 覆盖）
- 当前字段映射为通用兼容模式：会话 ID、客服 ID、会话开始/结束时间、满意度评分、转需求标记（多候选字段）
- 同步策略为“按时间窗口回补 + 幂等 upsert”，默认从 `2026-01-01` 开始全量回补
- 同步失败会写入 `SyncIssue`，用于后续排查与补偿，接口：`GET /api/v1/sync/issues`

## Udesk 展示接口

- `GET /api/v1/udesc/overview`：指定时间内咨询总量、客服人数、平均满意度等
- `GET /api/v1/udesc/tree`：树状数据（客服 -> 会话）
- `GET /api/v1/udesc/sessions`：结构化会话明细（含消息列表）

## Udesk 同步关键配置

- `UDESC_SYNC_START_DATE`：同步起始时间，默认 `2026-01-01T00:00:00.000Z`
- `UDESC_SYNC_WINDOW_DAYS`：每次同步时间片大小（天），默认 `1`
- `SYNC_CRON`：默认每 6 小时执行一次（低时效高完整）
- `SYNC_RETRY_MAX_ATTEMPTS` / `SYNC_RETRY_BASE_DELAY_MS`：失败重试参数

## 仍建议补充的 API 信息

- 驺吾分页、增量游标和状态字典字段
- Udesk “咨询转需求”标准字段（若不在 `im/sessions/vote` 中）
- 各接口错误码、限流阈值和重试建议
