"""配置加载器 - 从数据库加载检查器配置"""
import json
from sqlalchemy import select
from app.database import async_session
from app.models.config import SystemConfig

# 默认规则配置
DEFAULT_RULE_CONFIG = {
    "check_number_format": True,
    "check_extra_spaces": True,
    "check_english_punctuation": True,
    "check_slash_to_semicolon": True,
    "check_consecutive_punctuation": True,
    "check_ending_punctuation": True,
    "check_english_brackets": True,
}

# 默认 Prompt
DEFAULT_PROMPT = """你是一个公文校对助手，负责检查错别字和标点语义问题。

## 重要原则：
- 宁可漏报，不可误报
- 只报告你100%确定是错误的内容

## 你检查两类问题：

### 1. 错别字（type: "typo"）
明确的错别字，如"按排"→"安排"，"工做"→"工作"

### 2. 标点语义问题（type: "punctuation"）
同一条工作内，用逗号分隔的多个独立任务应该用分号分隔。
例如：
- 错误："梳理算力中心项目材料，参加观德巷项目例会"
- 正确："梳理算力中心项目材料；参加观德巷项目例会"
判断标准：如果逗号前后是两个独立的、可以单独成句的任务，应该用分号。

## 你绝对不要检查：
- 英文标点转中文标点（由程序处理）
- 序号格式（由程序处理）
- 空格问题（由程序处理）
- 句末标点（由程序处理）
- 专有名词（地名、人名、机构名）
- 语句是否完整（不要建议补充内容）

## 输出格式：
{
  "issues": [
    {
      "type": "typo或punctuation",
      "location": "本周工作第2条",
      "context": "包含错误的句子片段，约15-20字",
      "original": "错误内容",
      "suggestion": "正确内容"
    }
  ]
}

没有问题时返回 {"issues": []}
只返回 JSON。"""

DEFAULT_PROMPT_CONFIG = {
    "system_prompt": DEFAULT_PROMPT,
    "check_typo": True,
    "check_punctuation_semantic": True,
}


async def get_rule_config() -> dict:
    """获取规则配置"""
    try:
        async with async_session() as session:
            result = await session.execute(
                select(SystemConfig).where(SystemConfig.key == "rule_config")
            )
            config = result.scalar_one_or_none()
            if config:
                return json.loads(config.value)
    except Exception as e:
        print(f"Failed to load rule config: {e}")
    return DEFAULT_RULE_CONFIG


async def get_prompt_config() -> dict:
    """获取 Prompt 配置"""
    try:
        async with async_session() as session:
            result = await session.execute(
                select(SystemConfig).where(SystemConfig.key == "prompt_config")
            )
            config = result.scalar_one_or_none()
            if config:
                return json.loads(config.value)
    except Exception as e:
        print(f"Failed to load prompt config: {e}")
    return DEFAULT_PROMPT_CONFIG
