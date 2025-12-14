"""
AI 标点检查器 - 专门检查需要语义理解的标点问题
"""
from __future__ import annotations
from openai import AsyncOpenAI
from app.config import settings
from app.schemas import CheckIssue
from app.services.checker.config_loader import get_prompt_config, get_punctuation_prompt
import json

PUNCTUATION_PROMPT = """你是一个公文标点校对专家，专门检查标点符号的语义问题。

## 核心原则
- 宁可漏报，不可误报
- 只有100%确定是错误时才报告
- 基于语义理解判断，不要机械套用规则

## 检查任务一：逗号与分号的使用

### 逗号应改为分号的情况：
当两个分句是**完全独立的任务/事项**时，应该用分号分隔：
- 主语切换：前后分句说的是不同的事
- 动作独立：两个动作没有因果、递进、时间顺序关系
- **关键判断**：如果分句以动词开头（如"调度"、"组织"、"完成"、"协助"、"指导"、"督促"、"跟进"、"做好"），通常是独立事项，前面应该用分号

示例1（多个独立任务用逗号错误）：
- 错误："做好化解工作，常态化督促各社区做好录入工作，协助做好安全生产工作。"
- 正确："做好化解工作；常态化督促各社区做好录入工作；协助做好安全生产工作。"

示例2（动词开头的并列分句）：
- 错误："调度做好换届选举的工作，调度各社区做好人员培训，指导做好工作方案。"
- 正确："调度做好换届选举的工作；调度各社区做好人员培训；指导做好工作方案。"
- 分析：三个分句都以动词开头（调度、调度、指导），是独立任务，用分号分隔

示例3：
- 错误："梳理项目材料，参加项目例会" → 两个独立任务
- 正确："梳理项目材料；参加项目例会"

### 分号应改为逗号的情况：
当两个分句是**同一任务的不同方面**或有**紧密关联**时，应该用逗号：
- 补充说明：后句是对前句的补充
- 因果关系：前后有因果联系
- 递进关系：后句是前句的延续

示例：
- 错误："完成报告撰写；并提交审核" → 同一任务的两个步骤
- 正确："完成报告撰写，并提交审核"

### 保持原样的情况：
如果原文的逗号/分号使用合理，不要修改。

## 检查任务二：句中句号应改为分号

在同一条工作内容中，如果有多个并列的分句，中间应该用分号分隔，只有最后一个用句号。

### 句号应改为分号的情况：
当一条内容包含多个并列任务/事项，中间用了句号但后面还有内容时：
- 错误："做好化解工作。常态化督促各社区做好录入工作；协助做好安全生产工作。"
- 正确："做好化解工作；常态化督促各社区做好录入工作；协助做好安全生产工作。"

判断依据：
- 句号后面还有内容（不是句末）
- 前后内容是同一条工作的多个并列事项
- 整条内容以句号结尾才是正确的句末

### 句中误用句号（断句错误）：
句号把一个完整的短语切断了：
- 错误："已完成资料。报告完善工作"
- 正确："已完成资料报告完善工作"

## 检查任务三：连续标点错误

- 错误："完善工作。，按时序要求"
- 正确："完善工作，按时序要求"

## 你不要检查（由其他程序处理，违反将导致错误）：
- 英文标点转中文标点
- 序号格式（如 1. 2. 3. 或 1、2、3、）- 序号必须保持 "数字." 格式，不要改成 "数字、"
- 句末是否有句号
- 错别字
- 行首的序号（如 "1." "2." "3."）不是你的检查范围

## 输出格式要求（极其重要！）：

### original 字段规则：
1. **必须是原文中可精确匹配的连续字符串**，不能有任何添加、删除或修改
2. 包含错误标点及其前后2-4个汉字
3. 如果一条内容中有多处相同错误，每处单独报告，确保 original 能唯一定位

### suggestion 字段规则：
1. 与 original 长度尽量接近，只修改需要改的标点
2. 不要添加或删除原文中的其他内容

### 示例：
原文："已完成资料。报告完善工作。，按时序要求"

正确输出（每个错误单独报告）：
{
  "issues": [
    {
      "type": "punctuation",
      "location": "本周工作第1条",
      "context": "已完成资料。报告完善工作",
      "original": "资料。报告",
      "suggestion": "资料报告"
    },
    {
      "type": "punctuation", 
      "location": "本周工作第1条",
      "context": "完善工作。，按时序要求",
      "original": "工作。，按",
      "suggestion": "工作，按"
    }
  ]
}

错误示例（不要这样做）：
- original 包含原文中不存在的内容
- 一次性报告多个错误合并在一起
- original 无法在原文中找到精确匹配

没有问题时返回 {"issues": []}
只返回 JSON。"""


class PunctuationAIChecker:
    def __init__(self):
        base_url = settings.DEEPSEEK_BASE_URL
        if not base_url.endswith('/v1'):
            base_url = base_url.rstrip('/') + '/v1'

        self.client = AsyncOpenAI(
            api_key=settings.DEEPSEEK_API_KEY,
            base_url=base_url
        )

    async def check(self, content: str, retry_count: int = 0) -> list[CheckIssue]:
        """调用 AI 进行标点语义检查，支持重试"""
        if not settings.DEEPSEEK_API_KEY:
            return []

        # 检查配置是否启用
        config = await get_prompt_config()
        if not config.get("check_punctuation_semantic", True):
            return []

        max_retries = 1  # 最多重试1次

        # 获取自定义 prompt，如果没有则使用默认
        custom_prompt = await get_punctuation_prompt()
        prompt_to_use = custom_prompt if custom_prompt else PUNCTUATION_PROMPT
        
        try:
            print(f"Calling AI punctuation checker with content length: {len(content)}, retry: {retry_count}")
            response = await self.client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": prompt_to_use},
                    {"role": "user", "content": content}
                ],
                temperature=0.1
            )

            result_text = response.choices[0].message.content
            print(f"AI punctuation response: {result_text[:500]}")

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
                    type="punctuation",
                    severity="error",
                    location=item.get("location", ""),
                    context=item.get("context", ""),
                    original=original,
                    suggestion=suggestion,
                    source="ai_punctuation"
                ))
            
            print(f"AI punctuation checker found {len(issues)} issues")
            return issues

        except json.JSONDecodeError as e:
            if retry_count < max_retries:
                print(f"JSON parse error, retrying... ({retry_count + 1}/{max_retries})")
                return await self.check(content, retry_count + 1)
            raise ValueError(f"AI 标点检查返回格式错误: {e}")
        except ValueError:
            raise  # 重新抛出 ValueError
        except Exception as e:
            if retry_count < max_retries:
                print(f"AI error, retrying... ({retry_count + 1}/{max_retries})")
                return await self.check(content, retry_count + 1)
            raise ValueError(f"AI 标点检查失败: {type(e).__name__}: {e}")

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


punctuation_ai_checker = PunctuationAIChecker()
