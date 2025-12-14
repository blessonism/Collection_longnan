"""每日动态相关模型"""
from sqlalchemy import Column, Integer, String, Text, Date, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.submission import get_shanghai_now


class DailyMember(Base):
    """人员名单表"""
    __tablename__ = "daily_members"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False)  # 姓名
    sort_order = Column(Integer, default=0)  # 排序顺序
    is_active = Column(Boolean, default=True)  # 是否启用
    created_at = Column(Date, default=get_shanghai_now)

    # 关联动态记录
    reports = relationship("DailyReport", back_populates="member")


class DailyReport(Base):
    """每日动态记录表"""
    __tablename__ = "daily_reports"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("daily_members.id"), nullable=False)
    date = Column(Date, nullable=False, index=True)  # 动态日期
    content = Column(Text, nullable=False)  # 动态内容
    created_at = Column(Date, default=get_shanghai_now)
    updated_at = Column(Date, default=get_shanghai_now, onupdate=get_shanghai_now)

    # 关联人员
    member = relationship("DailyMember", back_populates="reports")
