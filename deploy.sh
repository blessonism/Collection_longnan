#!/bin/bash
# 周小结平台部署脚本

set -e

echo "=== 周小结平台 Docker 部署 ==="

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "创建 .env 配置文件..."
    cp .env.example .env
    echo "⚠️  请编辑 .env 文件，填入 DEEPSEEK_API_KEY"
    echo "   vim .env"
    exit 1
fi

# 检查 DEEPSEEK_API_KEY 是否已配置
if grep -q "your_deepseek_api_key_here" .env; then
    echo "⚠️  请先在 .env 中配置 DEEPSEEK_API_KEY"
    exit 1
fi

# 创建数据目录
echo "创建数据目录..."
mkdir -p docker-data/db docker-data/uploads docker-data/archives

# 构建并启动
echo "构建 Docker 镜像..."
docker-compose build

echo "启动服务..."
docker-compose up -d

echo ""
echo "=== 部署完成 ==="
echo "服务地址: http://localhost:${PORT:-3000}"
echo ""
echo "常用命令:"
echo "  查看日志: docker-compose logs -f"
echo "  停止服务: docker-compose down"
echo "  重启服务: docker-compose restart"
echo "  查看状态: docker-compose ps"
