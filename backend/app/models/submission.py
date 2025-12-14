from datetime import datetime, timezone, timedelta
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from app.database import Base

# 上海时区 (UTC+8)
SHANGHAI_TZ = timezone(timedelta(hours=8))

def get_shanghai_now():
    return datetime.now(SHANGHAI_TZ).replace(tzinfo=None)

class Submission(Base):
    __tablename__ = "submissions"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False)  # 姓名
    date_range = Column(String(20), nullable=False)  # 日期范围，如 "11.29-12.5"
    weekly_work = Column(Text, nullable=False)  # 本周工作
    next_week_plan = Column(Text, nullable=False)  # 下周计划
    
    source = Column(String(10), default="form")  # form | upload
    original_filename = Column(String(255), nullable=True)  # 上传的原始文件名
    stored_filename = Column(String(255), nullable=True)  # 存储文件名
    
    status = Column(String(20), default="submitted")  # draft | submitted | checked | archived
    check_result = Column(JSON, nullable=True)  # 校对结果
    
    created_at = Column(DateTime, default=get_shanghai_now)
    updated_at = Column(DateTime, default=get_shanghai_now, onupdate=get_shanghai_now)
