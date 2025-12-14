"""
每日动态 AI 优化器
"""
from openai import AsyncOpenAI
from app.config import settings
from app.services.checker.config_loader import get_daily_optimize_prompt


class DailyOptimizer:
    def __init__(self):
        base_url = settings.DEEPSEEK_BASE_URL
        if not base_url.endswith('/v1'):
            base_url = base_url.rstrip('/') + '/v1'

        self.client = AsyncOpenAI(
            api_key=settings.DEEPSEEK_API_KEY,
            base_url=base_url
        )

    async def optimize(self, content: str) -> str:
        """调用 AI 优化每日动态内容"""
        if not settings.DEEPSEEK_API_KEY:
            raise ValueError("未配置 DEEPSEEK_API_KEY")

        # 获取配置的 Prompt
        prompt = await get_daily_optimize_prompt()

        try:
            response = await self.client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": f"请优化以下每日动态：\n\n{content}"}
                ],
                temperature=0.3
            )

            result = response.choices[0].message.content.strip()
            return result

        except Exception as e:
            raise ValueError(f"AI 优化失败: {type(e).__name__}: {e}")


daily_optimizer = DailyOptimizer()
