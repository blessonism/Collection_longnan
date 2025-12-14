"""
AI 校对器 - 使用 DeepSeek 检查错别字和标点语义问题
支持从数据库加载自定义 Prompt
"""
from openai import AsyncOpenAI
from app.config import settings
from app.schemas import CheckIssue
from app.services.checker.config_loader import get_prompt_config, DEFAULT_PROMPT_CONFIG
import json


class DeepSeekChecker:
    def __init__(self):
        base_url = settings.DEEPSEEK_BASE_URL
        if not base_url.endswith('/v1'):
            base_url = base_url.rstrip('/') + '/v1'

        self.client = AsyncOpenAI(
            api_key=settings.DEEPSEEK_API_KEY,
            base_url=base_url
        )
        print(f"DeepSeek checker initialized with base_url: {base_url}")

    async def check(self, content: str) -> list[CheckIssue]:
        """调用 DeepSeek 进行内容校对"""
        if not settings.DEEPSEEK_API_KEY:
            print("DeepSeek API key not configured")
            return []

        # 加载配置
        config = await get_prompt_config()
        
        # 如果 AI 检查都被禁用，直接返回
        if not config.get("check_typo", True) and not config.get("check_punctuation_semantic", True):
            print("AI check disabled by config")
            return []

        system_prompt = config.get("system_prompt", DEFAULT_PROMPT_CONFIG["system_prompt"])

        try:
            print(f"Calling DeepSeek API with content length: {len(content)}")
            response = await self.client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": content}
                ],
                temperature=0.1
            )

            result_text = response.choices[0].message.content
            print(f"DeepSeek response: {result_text[:500]}")

            # 尝试提取 JSON
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0]
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0]

            result = json.loads(result_text.strip())

            issues = []
            seen = set()
            for item in result.get("issues", []):
                key = (item.get("location", ""), item.get("original", ""), item.get("suggestion", ""))
                if key in seen:
                    continue
                seen.add(key)

                original = item.get("original", "")
                suggestion = item.get("suggestion", "")
                issue_type = item.get("type", "unknown")

                if not original or not suggestion or original == suggestion:
                    continue

                # 根据配置过滤
                if issue_type == "typo" and not config.get("check_typo", True):
                    continue
                if issue_type == "punctuation" and not config.get("check_punctuation_semantic", True):
                    continue

                issues.append(CheckIssue(
                    type=issue_type,
                    severity="warning" if issue_type == "typo" else "error",
                    location=item.get("location", ""),
                    context=item.get("context", ""),
                    original=original,
                    suggestion=suggestion
                ))
            print(f"Found {len(issues)} issues (after dedup)")
            return issues

        except json.JSONDecodeError as e:
            print(f"JSON parse error: {e}, response: {result_text}")
            return []
        except Exception as e:
            print(f"DeepSeek check error: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            return []


deepseek_checker = DeepSeekChecker()
