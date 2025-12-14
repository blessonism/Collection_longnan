"""
AI 错字检查器 - 专门检查错别字
"""
from __future__ import annotations
from openai import AsyncOpenAI
from app.config import settings
from app.schemas import CheckIssue
from app.services.checker.config_loader import get_prompt_config, get_typo_prompt
import json

TYPO_PROMPT = """你是一个公文错字校对专家，只负责检查错别字。

## 重要原则：
- 宁可漏报，不可误报
- 只报告你100%确定是错误的错别字
- original 和 suggestion 必须是汉字词语，不能是标点符号或数字

## 你只检查：
错别字（汉字写错），如：
- "按排"→"安排"
- "工做"→"工作"
- "负责"→"负责"
- "研究"→"研究"

## 你绝对不要检查（非常重要！违反将导致系统错误）：
- 标点符号（如 。，；：、！？等）- 由其他程序处理
- 序号格式（如 1. 2. 3.）- 由其他程序处理
- 数字 - 不是你的职责
- 空格问题 - 由其他程序处理
- 专有名词（地名、人名、机构名）
- 语句是否完整（不要建议补充内容）
- 用词是否"更好"（不做优化建议）

## 输出格式：
{
  "issues": [
    {
      "type": "typo",
      "location": "本周工作第2条",
      "context": "包含错误的句子片段，约15-20字",
      "original": "错误的汉字词语",
      "suggestion": "正确的汉字词语"
    }
  ]
}

## 重要：original 和 suggestion 必须都是汉字，不能包含标点符号或数字！

没有错别字时返回 {"issues": []}
只返回 JSON。"""


class DeepSeekChecker:
    def __init__(self):
        base_url = settings.DEEPSEEK_BASE_URL
        if not base_url.endswith('/v1'):
            base_url = base_url.rstrip('/') + '/v1'

        self.client = AsyncOpenAI(
            api_key=settings.DEEPSEEK_API_KEY,
            base_url=base_url
        )
        print(f"DeepSeek typo checker initialized with base_url: {base_url}")

    async def check(self, content: str, retry_count: int = 0) -> list[CheckIssue]:
        """调用 AI 进行错字检查，支持重试"""
        if not settings.DEEPSEEK_API_KEY:
            return []

        # 检查配置是否启用
        config = await get_prompt_config()
        if not config.get("check_typo", True):
            return []

        max_retries = 1  # 最多重试1次

        # 获取自定义 prompt，如果没有则使用默认
        custom_prompt = await get_typo_prompt()
        prompt_to_use = custom_prompt if custom_prompt else TYPO_PROMPT

        try:
            print(f"Calling AI typo checker with content length: {len(content)}, retry: {retry_count}")
            response = await self.client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": prompt_to_use},
                    {"role": "user", "content": content}
                ],
                temperature=0.1
            )

            result_text = response.choices[0].message.content
            print(f"AI typo response: {result_text[:500]}")

            # 提取 JSON（增强容错）
            json_text = self._extract_json(result_text)
            if not json_text:
                if retry_count < max_retries:
                    print(f"Failed to extract JSON, retrying... ({retry_count + 1}/{max_retries})")
                    return await self.check(content, retry_count + 1)
                raise ValueError("AI 返回格式错误，无法解析 JSON")

            result = json.loads(json_text)

            issues = []
            seen = set()
            for item in result.get("issues", []):
                key = (item.get("location", ""), item.get("original", ""), item.get("suggestion", ""))
                if key in seen:
                    continue
                seen.add(key)

                original = item.get("original", "")
                suggestion = item.get("suggestion", "")

                if not original or not suggestion or original == suggestion:
                    continue

                issues.append(CheckIssue(
                    type="typo",
                    severity="warning",
                    location=item.get("location", ""),
                    context=item.get("context", ""),
                    original=original,
                    suggestion=suggestion,
                    source="ai_typo"
                ))
            
            print(f"AI typo checker found {len(issues)} issues")
            return issues

        except json.JSONDecodeError as e:
            if retry_count < max_retries:
                print(f"JSON parse error, retrying... ({retry_count + 1}/{max_retries})")
                return await self.check(content, retry_count + 1)
            raise ValueError(f"AI 错字检查返回格式错误: {e}")
        except ValueError:
            raise  # 重新抛出 ValueError
        except Exception as e:
            if retry_count < max_retries:
                print(f"AI error, retrying... ({retry_count + 1}/{max_retries})")
                return await self.check(content, retry_count + 1)
            raise ValueError(f"AI 错字检查失败: {type(e).__name__}: {e}")

    def _extract_json(self, text: str) -> str | None:
        """从 AI 响应中提取 JSON，增强容错"""
        if not text:
            return None
        
        text = text.strip()
        
        # 尝试1：直接解析
        if text.startswith('{') and text.endswith('}'):
            try:
                json.loads(text)
                return text
            except json.JSONDecodeError:
                pass
        
        # 尝试2：提取 ```json ... ``` 代码块
        if "```json" in text:
            try:
                json_text = text.split("```json")[1].split("```")[0].strip()
                json.loads(json_text)
                return json_text
            except (IndexError, json.JSONDecodeError):
                pass
        
        # 尝试3：提取 ``` ... ``` 代码块
        if "```" in text:
            try:
                json_text = text.split("```")[1].split("```")[0].strip()
                json.loads(json_text)
                return json_text
            except (IndexError, json.JSONDecodeError):
                pass
        
        # 尝试4：查找第一个 { 和最后一个 } 之间的内容
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            try:
                json_text = text[start:end + 1]
                json.loads(json_text)
                return json_text
            except json.JSONDecodeError:
                pass
        
        # 尝试5：如果内容很短且看起来像空结果
        if '[]' in text or '"issues": []' in text or '"issues":[]' in text:
            return '{"issues": []}'
        
        return None


deepseek_checker = DeepSeekChecker()
