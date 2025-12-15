"""每日动态相关路由"""
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, distinct
from app.database import get_db
from app.models.daily import DailyMember, DailyReport
from app.schemas import (
    DailyMemberCreate, DailyMemberUpdate, DailyMemberResponse, DailyMemberImport,
    DailyReportCreate, DailyReportUpdate, DailyReportResponse, DailyReportSummary
)

router = APIRouter(prefix="/api/daily", tags=["每日动态"])

# 星期映射
WEEKDAY_MAP = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


# ========== 人员管理 ==========

@router.get("/members", response_model=List[DailyMemberResponse])
async def list_members(include_inactive: bool = False, db: AsyncSession = Depends(get_db)):
    """获取人员名单"""
    query = select(DailyMember)
    if not include_inactive:
        query = query.where(DailyMember.is_active == True)
    query = query.order_by(DailyMember.sort_order, DailyMember.id)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/members", response_model=DailyMemberResponse)
async def create_member(data: DailyMemberCreate, db: AsyncSession = Depends(get_db)):
    """添加人员"""
    member = DailyMember(**data.model_dump())
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


@router.post("/members/import", response_model=List[DailyMemberResponse])
async def import_members(data: DailyMemberImport, db: AsyncSession = Depends(get_db)):
    """批量导入人员名单"""
    members = []
    for i, name in enumerate(data.names):
        name = name.strip()
        if not name:
            continue
        # 检查是否已存在
        result = await db.execute(select(DailyMember).where(DailyMember.name == name))
        existing = result.scalar_one_or_none()
        
        if existing:
            # 如果已存在但被禁用，重新启用
            if not existing.is_active:
                existing.is_active = True
                await db.commit()
            members.append(existing)
        else:
            member = DailyMember(name=name, sort_order=i)
            db.add(member)
            await db.commit()
            await db.refresh(member)
            members.append(member)
    return members


@router.put("/members/{member_id}", response_model=DailyMemberResponse)
async def update_member(member_id: int, data: DailyMemberUpdate, db: AsyncSession = Depends(get_db)):
    """更新人员信息"""
    result = await db.execute(select(DailyMember).where(DailyMember.id == member_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="人员不存在")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(member, key, value)
    await db.commit()
    await db.refresh(member)
    return member


@router.delete("/members/{member_id}")
async def delete_member(member_id: int, db: AsyncSession = Depends(get_db)):
    """删除人员（软删除）"""
    result = await db.execute(select(DailyMember).where(DailyMember.id == member_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="人员不存在")
    
    member.is_active = False
    await db.commit()
    return {"message": "删除成功"}


# ========== 动态记录 ==========

@router.post("/reports", response_model=Optional[DailyReportResponse])
async def create_report(data: DailyReportCreate, db: AsyncSession = Depends(get_db)):
    """提交每日动态"""
    # 检查人员是否存在
    result = await db.execute(select(DailyMember).where(DailyMember.id == data.member_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="人员不存在")
    
    # 检查是否已提交过
    result = await db.execute(
        select(DailyReport).where(
            DailyReport.member_id == data.member_id,
            DailyReport.date == data.date
        )
    )
    existing = result.scalar_one_or_none()
    
    # 如果内容为空，删除已有记录（回滚到未提交状态）
    content_stripped = data.content.strip() if data.content else ""
    if not content_stripped:
        if existing:
            await db.delete(existing)
            await db.commit()
        return None
    
    if existing:
        # 更新已有记录
        existing.content = content_stripped
        await db.commit()
        await db.refresh(existing)
        return DailyReportResponse(
            id=existing.id,
            member_id=existing.member_id,
            member_name=member.name,
            date=existing.date,
            content=existing.content
        )
    
    # 创建新记录
    report = DailyReport(member_id=data.member_id, date=data.date, content=content_stripped)
    db.add(report)
    await db.commit()
    await db.refresh(report)
    
    return DailyReportResponse(
        id=report.id,
        member_id=report.member_id,
        member_name=member.name,
        date=report.date,
        content=report.content
    )


@router.get("/reports", response_model=List[DailyReportResponse])
async def list_reports(report_date: date, db: AsyncSession = Depends(get_db)):
    """获取某天的动态列表"""
    result = await db.execute(select(DailyReport).where(DailyReport.date == report_date))
    reports = result.scalars().all()
    
    response_list = []
    for report in reports:
        member_result = await db.execute(select(DailyMember).where(DailyMember.id == report.member_id))
        member = member_result.scalar_one_or_none()
        response_list.append(DailyReportResponse(
            id=report.id,
            member_id=report.member_id,
            member_name=member.name if member else "未知",
            date=report.date,
            content=report.content
        ))
    return response_list


@router.get("/reports/summary", response_model=DailyReportSummary)
async def get_summary(report_date: date, db: AsyncSession = Depends(get_db)):
    """获取某天的汇总"""
    # 获取所有活跃人员
    result = await db.execute(
        select(DailyMember)
        .where(DailyMember.is_active == True)
        .order_by(DailyMember.sort_order, DailyMember.id)
    )
    members = result.scalars().all()
    
    # 获取当天的动态
    result = await db.execute(select(DailyReport).where(DailyReport.date == report_date))
    reports = result.scalars().all()
    reports_map = {r.member_id: r for r in reports}
    
    # 构建响应
    report_list = []
    summary_lines = []
    weekday = WEEKDAY_MAP[report_date.weekday()]
    date_display = f"{report_date.month}月{report_date.day}日 {weekday}"
    
    for i, member in enumerate(members):
        report = reports_map.get(member.id)
        if report:
            report_list.append(DailyReportResponse(
                id=report.id,
                member_id=report.member_id,
                member_name=member.name,
                date=report.date,
                content=report.content
            ))
            # 直接使用原始名字，不添加"同志"
            summary_lines.append(f"{i + 1}、{member.name} {report.content}")
    
    # 生成汇总文本
    summary_text = f"每日动态（{date_display}）\n" + "\n".join(summary_lines) if summary_lines else ""
    
    return DailyReportSummary(
        date=report_date,
        date_display=date_display,
        total_members=len(members),
        submitted_count=len(report_list),
        reports=report_list,
        summary_text=summary_text
    )


@router.put("/reports/{report_id}", response_model=DailyReportResponse)
async def update_report(report_id: int, data: DailyReportUpdate, db: AsyncSession = Depends(get_db)):
    """更新动态"""
    result = await db.execute(select(DailyReport).where(DailyReport.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="记录不存在")
    
    report.content = data.content
    await db.commit()
    await db.refresh(report)
    
    member_result = await db.execute(select(DailyMember).where(DailyMember.id == report.member_id))
    member = member_result.scalar_one_or_none()
    return DailyReportResponse(
        id=report.id,
        member_id=report.member_id,
        member_name=member.name if member else "未知",
        date=report.date,
        content=report.content
    )


@router.delete("/reports/{report_id}")
async def delete_report(report_id: int, db: AsyncSession = Depends(get_db)):
    """删除动态"""
    result = await db.execute(select(DailyReport).where(DailyReport.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="记录不存在")
    
    await db.delete(report)
    await db.commit()
    return {"message": "删除成功"}


@router.get("/dates")
async def list_dates(db: AsyncSession = Depends(get_db)):
    """获取有记录的日期列表"""
    result = await db.execute(
        select(distinct(DailyReport.date)).order_by(DailyReport.date.desc()).limit(30)
    )
    dates = result.scalars().all()
    return dates


# ========== AI 优化 ==========

from pydantic import BaseModel

class OptimizeRequest(BaseModel):
    content: str

class OptimizeResponse(BaseModel):
    optimized_content: str

@router.post("/optimize", response_model=OptimizeResponse)
async def optimize_daily(data: OptimizeRequest):
    """AI 优化每日动态内容"""
    from app.services.daily_optimizer import daily_optimizer
    
    try:
        optimized = await daily_optimizer.optimize(data.content)
        return OptimizeResponse(optimized_content=optimized)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ========== 周小结生成 ==========

from app.schemas import GenerateWeeklySummaryRequest, GenerateWeeklySummaryResponse

@router.post("/generate-weekly-summary", response_model=GenerateWeeklySummaryResponse)
async def generate_weekly_summary(
    data: GenerateWeeklySummaryRequest, 
    db: AsyncSession = Depends(get_db)
):
    """根据每日动态生成周小结"""
    from app.utils.date_parser import parse_date_range
    from app.services.weekly_summary_generator import weekly_summary_generator
    
    # 解析日期范围
    try:
        start_date, end_date = parse_date_range(data.date_range)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # 检查人员是否存在
    result = await db.execute(select(DailyMember).where(DailyMember.id == data.member_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="人员不存在")
    
    # 生成周小结
    try:
        content = await weekly_summary_generator.generate(
            db, data.member_id, start_date, end_date
        )
        
        # 获取使用的记录数量
        reports = await weekly_summary_generator.get_daily_reports(
            db, data.member_id, start_date, end_date
        )
        
        return GenerateWeeklySummaryResponse(
            content=content,
            start_date=start_date,
            end_date=end_date,
            report_count=len(reports)
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
