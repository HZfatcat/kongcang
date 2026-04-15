FROM node:22-alpine AS builder
WORKDIR /app
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    apk add --no-cache openssl-dev

COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/package.json
RUN npm install

COPY . .
RUN npm run prisma:generate --workspace apps/api
RUN npm run build --workspace apps/api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    apk add --no-cache openssl3

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

WORKDIR /app/apps/api
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
