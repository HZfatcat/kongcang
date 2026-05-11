FROM node:22-alpine AS builder
WORKDIR /app

ARG VITE_WECOM_APPID
ARG VITE_WECOM_AGENTID
ARG VITE_WECOM_CSDN_APPID
ARG VITE_WECOM_CSDN_AGENTID
ARG VITE_API_BASE_URL
ARG VITE_DISABLE_AUTH

ENV VITE_WECOM_APPID=$VITE_WECOM_APPID
ENV VITE_WECOM_AGENTID=$VITE_WECOM_AGENTID
ENV VITE_WECOM_CSDN_APPID=$VITE_WECOM_CSDN_APPID
ENV VITE_WECOM_CSDN_AGENTID=$VITE_WECOM_CSDN_AGENTID
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_DISABLE_AUTH=$VITE_DISABLE_AUTH

COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm install

COPY . .
RUN cd apps/web && /app/node_modules/.bin/vite build

FROM nginx:1.27-alpine
ENV TZ=Asia/Shanghai
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
