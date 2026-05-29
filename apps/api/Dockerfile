# 使用 Debian 基础镜像，Prisma 原生支持，无需额外配置
FROM node:22-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/package.json
RUN npm ci

COPY . .
RUN npm run prisma:generate --workspace apps/api
RUN npm run build --workspace apps/api

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

RUN apt-get update && apt-get install -y openssl curl python3 python3-pip && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖（Udesk 数据同步用）
RUN pip3 install requests --break-system-packages --no-cache-dir

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
# 复制根目录的 Python 同步脚本（供 syncCallStats 调用）
COPY udesk_report.py ./udesk_report.py

WORKDIR /app/apps/api
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
