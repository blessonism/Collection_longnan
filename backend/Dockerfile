# Backend Dockerfile
FROM python:3.11-slim

WORKDIR /app

# 利用 Docker 构建缓存：先复制依赖文件
COPY requirements.txt .

# 使用国内镜像源加速依赖安装
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple --trusted-host pypi.tuna.tsinghua.edu.cn

# 复制应用代码（代码变化不会触发依赖重装）
COPY . .

# 创建数据目录 (运行时会被 volume 覆盖)
RUN mkdir -p data uploads archives

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
