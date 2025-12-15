# Frontend Dockerfile - 多阶段构建
FROM node:20-alpine AS builder

WORKDIR /app

# 利用 Docker 构建缓存：先复制依赖文件
COPY package*.json ./

# 使用 npm 缓存加速依赖安装
# 只有 package.json 变化时才会重新安装
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# 复制应用代码（代码变化不会触发依赖重装）
COPY . .
RUN npm run build

# 生产阶段 - 使用 nginx 托管静态文件
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
