# Backend Dockerfile
FROM python:3.11-slim

WORKDIR /app

# 利用 Docker 构建缓存：先复制依赖文件
COPY requirements.txt .

# 使用 pip 缓存加速依赖安装
# 只有 requirements.txt 变化时才会重新安装
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

# 复制应用代码（代码变化不会触发依赖重装）
COPY . .

# 创建数据目录 (运行时会被 volume 覆盖)
RUN mkdir -p data uploads archives

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
