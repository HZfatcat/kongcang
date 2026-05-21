# GitCode 客服运营看板（kefumonitor）

客服运营数据分析与需求管理的全栈系统。整合 Udesk 客服数据与驺吾需求管理平台，提供数据同步、可视化看板、商机管理与系统运维功能。

## 功能模块

### 📊 运营概览
- **满意度看板**：咨询总量、消息总量、平均消息数、客服人数、总评价数、平均满意度
- **趋势分析**：客服每日趋势图（咨询量 + 消息数，双 Y 轴），支持按人员/指标筛选
- **业务树视图**：按咨询量排序的客服业务树，显示平均评分和消息数
- **咨询漏斗**：按日/周/月粒度分析咨询转化情况

### 📋 需求管理
- **需求概览**：需求/Bug 月度统计、完成率趋势
- **最近动态**：最近需求和 Bug 列表，支持详情查看
- **需求详情**：需求/Bug 详情页，显示完整信息

### 💼 商机管理
- **商机列表**：分页展示商机，支持状态/来源/关键字筛选
- **商机创建**：手工录入或从咨询会话一键转商机
- **状态流转**：新建 → 已甄别 → 跟进中 → 赢单/输单

### 🔄 数据同步
- **Udesk 同步**：会话、消息、评分数据增量同步
- **驺吾同步**：需求/Bug 数据同步与反馈统计
- **同步配置**：定时任务启停、同步间隔设置
- **进度监控**：实时同步进度、失败记录、重试补偿
- **历史记录**：同步日志、检查点续传

### 👥 人员管理
- **客服人员**：维护客服资料并与 Udesk agentId 关联
- **企微员工**：公司全员管理，支持客服部门标记

### 📝 系统日志
- **日志查询**：按级别/模块/来源/时间/关键字筛选
- **统计面板**：各级别日志数量、模块分布
- **日志清理**：按时间范围清理历史日志

### 🔐 企业微信登录
- 双主体 OAuth 登录（开源共创 corp / 创新乐知 csdn）
- 企微内置浏览器自动授权 + 普通浏览器扫码登录
- 登录账号需在人员管理中存在且 enabled=true

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | NestJS + Prisma + PostgreSQL + Redis |
| 前端 | React + Vite + Ant Design + ECharts |
| 队列 | BullMQ（异步任务处理） |
| 通信 | WebSocket（实时进度推送） |
| 部署 | Docker Compose |
| 架构 | npm workspaces 单体仓库 |

## 项目结构

```
kefumonitor/
├── apps/
│   ├── api/                    # 后端服务（NestJS）
│   │   ├── prisma/             # 数据库模型与迁移
│   │   │   ├── schema.prisma   # 数据模型定义
│   │   │   └── migrations/     # 数据库迁移
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── agents/     # 客服人员管理
│   │       │   ├── auth/       # 企微登录认证
│   │       │   ├── cache/      # Redis 缓存
│   │       │   ├── health/     # 健康检查
│   │       │   ├── kpi/        # KPI 统计
│   │       │   ├── logs/       # 系统日志
│   │       │   ├── opportunity/# 商机管理
│   │       │   ├── queue/      # BullMQ 任务队列
│   │       │   ├── sync/       # 数据同步调度
│   │       │   ├── udesc/      # Udesk 数据查询
│   │       │   ├── websocket/  # WebSocket 推送
│   │       │   └── wecom-employee/ # 企微员工管理
│   │       └── common/         # 公共模块（日志、拦截器）
│   └── web/                    # 前端看板（React）
│       └── src/
│           ├── pages/          # 页面组件
│           │   ├── DashboardPage.tsx    # 运营看板
│           │   ├── DemandSummaryPage.tsx # 需求概览
│           │   ├── LogsPage.tsx         # 系统日志
│           │   ├── UsersPage.tsx        # 用户管理
│           │   └── LoginPage.tsx        # 登录页
│           ├── api/            # API 请求封装
│           ├── components/     # 公共组件
│           └── types/          # TypeScript 类型
├── deploy/
│   └── nginx/                  # Nginx 配置
├── docker-compose.yml          # 容器编排（生产）
├── docker-compose.dev.yml      # 容器编排（开发）
└── package.json                # 根项目脚本
```

## 快速开始

### Docker 部署（推荐）

```bash
# 1. 复制配置文件
cp .env.example .env

# 2. 编辑配置（填写必要的环境变量）
vi .env

# 3. 启动服务
docker compose up -d --build

# 4. 访问地址
# 前端：http://localhost:8080
# 后端：http://localhost:3000/api/v1/health
```

### 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 启动数据库（可复用 Docker）
docker compose up -d postgres redis

# 3. 初始化数据库
npm run prisma:generate --workspace apps/api
npm run prisma:migrate:dev --workspace apps/api

# 4. 启动后端（端口 3000）
npm run dev --workspace apps/api

# 5. 启动前端（端口 5801）
npm run dev --workspace apps/web -- --host localhost --port 5801
```

### NPM 脚本

```bash
npm run dev              # 本地开发（复制 .env.dev-local 并启动前后端）
npm run dev:docker       # Docker 开发环境
npm run prod             # Docker 生产环境
npm run build            # 构建前后端
npm run test             # 运行测试
```

## API 接口

### 健康检查
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/health` | 服务健康检查 |

### KPI 统计
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/kpi/overview` | 运营概览（咨询量、满意度等） |
| GET | `/api/v1/kpi/demand` | 需求概览（需求/Bug 统计） |
| GET | `/api/v1/kpi/consultation-funnel` | 咨询漏斗数据 |

### Udesk 数据
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/udesc/overview` | 满意度统计 |
| GET | `/api/v1/udesc/tree` | 客服业务树 |
| GET | `/api/v1/udesc/sessions` | 咨询会话列表 |
| GET | `/api/v1/udesc/daily-agent-stats` | 客服每日统计 |

### 数据同步
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/sync/run` | 手动触发 Udesk 同步 |
| POST | `/api/v1/sync/run-zouwu` | 手动触发驺吾同步 |
| GET | `/api/v1/sync/progress` | 实时同步进度 |
| GET | `/api/v1/sync/summary` | 同步汇总统计 |
| GET | `/api/v1/sync/runs` | 历史同步记录 |
| GET | `/api/v1/sync/issues` | 同步失败记录 |
| POST | `/api/v1/sync/issues/retry` | 重试失败记录 |
| GET/POST | `/api/v1/sync/config` | Udesk 定时同步配置 |
| GET/POST | `/api/v1/sync/zouwu/config` | 驺吾定时同步配置 |

### 商机管理
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/opportunities` | 商机列表 |
| GET | `/api/v1/opportunities/summary` | 商机统计 |
| POST | `/api/v1/opportunities/upsert` | 创建/更新商机 |
| POST | `/api/v1/opportunities/:id/status` | 更新商机状态 |
| DELETE | `/api/v1/opportunities/:id` | 删除商机 |

### 人员管理
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/agents` | 客服人员列表 |
| POST | `/api/v1/agents/upsert` | 创建/更新客服 |
| DELETE | `/api/v1/agents/:agentId` | 删除客服 |
| GET | `/api/v1/wecom-employees` | 企微员工列表 |
| POST | `/api/v1/wecom-employees/upsert` | 创建/更新企微员工 |
| DELETE | `/api/v1/wecom-employees/:userId` | 删除企微员工 |

### 系统日志
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/logs` | 日志列表（支持分页、筛选） |
| GET | `/api/v1/logs/stats` | 日志统计 |
| GET | `/api/v1/logs/:id` | 日志详情 |
| DELETE | `/api/v1/logs/clear` | 清理历史日志 |

### 企业微信登录
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/auth/wxlogin` | 开源共创主体登录 |
| GET | `/api/v1/auth/csdnwxlogin` | 创新乐知主体登录 |
| GET | `/api/v1/auth/getState` | 获取登录状态 |

## 环境变量

### 基础配置
| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://user:pass@localhost:5432/kefumonitor` |
| `REDIS_URL` | Redis 连接串 | `redis://localhost:6379` |
| `PORT` | 后端端口 | `3000` |
| `CORS_ORIGIN` | CORS 允许来源 | `http://localhost:5801` |

### Udesk 配置
| 变量 | 说明 |
|------|------|
| `UDESC_BASE_URL` | Udesk API 地址 |
| `UDESC_EMAIL` / `UDESC_PASSWORD` | 登录凭证 |
| `UDESC_TOKEN` | 已有 token（可选） |
| `UDESC_SYNC_START_DATE` | 同步起始日期 |
| `UDESC_SYNC_WINDOW_DAYS` | 时间窗口天数 |
| `UDESC_PROVIDER_MAX_LOOKBACK_DAYS` | 最大回溯天数 |

### 驺吾配置
| 变量 | 说明 |
|------|------|
| `ZOUWU_BASE_URL` | 驺吾 API 地址 |
| `ZOUWU_APP_TOKEN` | 应用 Token |
| `ZOUWU_COOKIE_NAME` | Cookie 名称（默认 `admin-plus-app-token`） |
| `ZOUWU_PROXY_MODE` | 代理模式（`auto`/`on`/`off`） |
| `ZOUWU_LONG_TERM_LABEL_NAME` | 长期演进标签名 |

### 同步配置
| 变量 | 说明 |
|------|------|
| `SYNC_HEARTBEAT_CRON` | 心跳检查 Cron（默认 `*/5 * * * *`） |
| `SYNC_RETRY_MAX_ATTEMPTS` | 最大重试次数 |
| `SYNC_RETRY_BASE_DELAY_MS` | 重试基础延迟 |
| `SYNC_ENABLE_ZOUWU` | 启用驺吾同步 |

### 企业微信登录
| 变量 | 说明 |
|------|------|
| `WECOM_CORP_CORPID` | 开源共创企业 ID |
| `WECOM_CORP_SECRET` | 开源共创应用 Secret |
| `WECOM_CSDN_CORPID` | 创新乐知企业 ID |
| `WECOM_CSDN_SECRET` | 创新乐知应用 Secret |
| `VITE_WECOM_APPID` | 前端应用 ID |
| `VITE_WECOM_AGENTID` | 前端 Agent ID |
| `AUTH_TOKEN_SECRET` | JWT 签名密钥 |

## 数据同步机制

### Udesk 同步
- **鉴权**：支持 `open_api_v1/log_in` 自动换取 token，支持签名参数 `sign_version=v2`
- **数据入口**：
  - 会话：`im/sessions/search`
  - 评分：`im/sessions/vote`（可选）
  - 消息：`im/sessions/log`
- **同步策略**：
  - 按时间窗口增量同步（默认 1 天）
  - 幂等 upsert，避免重复写入
  - 检查点续传（`SyncCheckpoint`）
  - 失败落库（`SyncIssue`）+ 重试补偿
- **调度策略**：
  - 心跳 Cron 每 5 分钟检查
  - 实际执行周期由页面配置控制

### 驺吾同步
- 从驺吾平台同步需求/Bug 数据
- 支持长期演进标签识别
- 统计反馈数据

## 数据库模型

| 模型 | 说明 |
|------|------|
| `UdescSession` | Udesk 咨询会话 |
| `UdescSessionMessage` | 会话消息 |
| `ZouwuRequirement` | 驺吾需求/Bug |
| `BusinessOpportunity` | 商机 |
| `AgentProfile` | 客服人员 |
| `WecomEmployee` | 企微员工 |
| `SyncCheckpoint` | 同步检查点 |
| `SyncRun` | 同步执行记录 |
| `SyncIssue` | 同步失败记录 |
| `SyncConfig` | 同步配置 |
| `SystemLog` | 系统日志 |

## 常见问题

**Q: API 容器启动报数据库连接 `127.0.0.1` 错误？**  
A: 确保使用容器内网地址（`postgres` / `redis`），不要使用本机回环地址。

**Q: Docker 拉取官方镜像 403？**  
A: 检查 Docker 镜像加速源，替换不可用镜像源后重试。

**Q: 前端登录后空白？**  
A: 检查 `VITE_WECOM_*` 前端环境变量是否正确配置，确保企微应用可信域名已设置。

## License

MIT
