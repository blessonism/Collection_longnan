from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.database import init_db
from app.routers import form_router, check_router, submission_router, archive_router, admin_router, daily_router
from app.migrations.add_original_content import migrate as run_migrations
import os

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时初始化数据库
    os.makedirs("./data", exist_ok=True)
    os.makedirs("./uploads", exist_ok=True)
    os.makedirs("./archives", exist_ok=True)
    await init_db()
    # 运行数据库迁移（添加缺失的列）
    run_migrations()
    yield

app = FastAPI(
    title="周小结管理平台",
    description="周小结收集、校对、归档一体化平台",
    version="1.0.0",
    lifespan=lifespan
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(form_router)
app.include_router(check_router)
app.include_router(submission_router)
app.include_router(archive_router)
app.include_router(admin_router)
app.include_router(daily_router)

@app.get("/")
async def root():
    return {"message": "周小结管理平台 API", "version": "1.0.0"}

@app.get("/health")
async def health():
    return {"status": "ok"}
