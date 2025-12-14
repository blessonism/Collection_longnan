"""系统配置模型"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from app.database import Base
from app.models.submission import get_shanghai_now


class SystemConfig(Base):
    """系统配置表"""
    __tablename__ = "system_configs"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=False)
    description = Column(String(255))
    updated_at = Column(DateTime, default=get_shanghai_now, onupdate=get_shanghai_now)
