"""
周小结生成器 - 根据每日动态生成周小结的"本周工作"部分
"""
from datetime import date
from typing import List, Tuple
from openai import AsyncOpenAI
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.daily import DailyMember, DailyReport
from app.services.checker.config_loader import get_weekly_summary_prompt


# 星期映射
WEEKDAY_MAP = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


class WeeklySummaryGenerator:
    def __init__(self):
        base_url = settings.DEEPSEEK_BASE_URL
        if not base_url.endswith('/v1'):
            base_url = base_url.rstrip('/') + '/v1'

        self.client = AsyncOpenAI(
            api_key=settings.DEEPSEEK_API_KEY,
            base_url=base_url
        )

    async def get_daily_reports(
        self, 
        db: AsyncSession, 
        member_id: int, 
        start_date: date, 
        end_date: date
    ) -> List[Tuple[date, str]]:
        """获取指定人员在日期范围内的每日动态"""
        result = await db.execute(
            select(DailyReport)
            .where(
                and_(
                    DailyReport.member_id == member_id,
                    DailyReport.date >= start_date,
                    DailyReport.date <= end_date
                )
            )
            .order_by(DailyReport.date)
        )
        reports = result.scalars().all()
        return [(r.date, r.content) for r in reports]

    async def generate(
        self, 
        db: AsyncSession, 
        member_id: int, 
        start_date: date, 
        end_date: date
    ) -> str:
        """
        根据每日动态生成周小结
        
        Args:
            db: 数据库会话
            member_id: 人员 ID
            start_date: 开始日期
            end_date: 结束日期
            
        Returns:
            生成的周小结内容
            
        Raises:
            ValueError: 如果没有找到每日动态记录或 AI 调用失败
        """
        if not settings.DEEPSEEK_API_KEY:
            raise ValueError("未配置 DEEPSEEK_API_KEY")

        # 获取每日动态
        reports = await self.get_daily_reports(db, member_id, start_date, end_date)
        
        if not reports:
            raise ValueError("该时间范围内没有每日动态记录")

        # 构建输入内容
        input_lines = []
        for report_date, content in reports:
            weekday = WEEKDAY_MAP[report_date.weekday()]
            date_str = f"{report_date.month}月{report_date.day}日 {weekday}"
            input_lines.append(f"{date_str}: {content}")
        
        input_content = "\n".join(input_lines)

        # 获取配置的 Prompt
        prompt = await get_weekly_summary_prompt()

        try:
            response = await self.client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": f"请根据以下每日动态生成周小结：\n\n{input_content}"}
                ],
                temperature=0.3
            )

            result = response.choices[0].message.content.strip()
            return result

        except Exception as e:
            raise ValueError(f"AI 生成失败: {type(e).__name__}: {e}")


weekly_summary_generator = WeeklySummaryGenerator()
