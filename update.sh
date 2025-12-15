#!/bin/bash
# 服务器端更新脚本

set -e

echo "=== 拉取最新代码 ==="
git pull

echo "=== 重新构建并启动 ==="
docker-compose up --build -d

echo "=== 查看服务状态 ==="
docker-compose ps

echo "=== 更新完成 ==="
