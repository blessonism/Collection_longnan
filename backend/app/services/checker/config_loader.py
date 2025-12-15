"""配置加载器 - 从数据库加载检查器配置"""
import json
from typing import Optional
from sqlalchemy import select
from app.database import async_session
from app.models.config import SystemConfig

# 默认规则配置
DEFAULT_RULE_CONFIG = {
    "check_number_format": True,
    "check_missing_number": True,  # 检查缺少序号
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
重点检查：同一条工作内，用逗号分隔的多个独立任务应该用分号分隔。

判断标准：如果逗号前后是两个独立的、可以单独成句的任务/工作，应该用分号而非逗号。

示例1：
- 错误："梳理算力中心项目材料，参加观德巷项目例会"
- 正确："梳理算力中心项目材料；参加观德巷项目例会"
- 原因："梳理材料"和"参加例会"是两个独立任务

示例2：
- 错误："已完成党组织选举后续资料报告完善工作，按时序要求推进居委换届，已完成6个社区选举委员会推选"
- 正确："已完成党组织选举后续资料报告完善工作，按时序要求推进居委换届；已完成6个社区选举委员会推选"
- 原因："推进居委换届"和"已完成选举委员会推选"是两个独立任务，应用分号

示例3（不需要修改）：
- "到金都社区第二网格查看建设进度，参加金都社区党员大会演练"
- 原因：这是同一个地点的连续活动，用逗号是正确的

## 你绝对不要检查：
- 英文标点转中文标点（由程序处理）
- 序号格式（由程序处理）
- 空格问题（由程序处理）
- 句末标点（由程序处理）
- 专有名词（地名、人名、机构名）
- 语句是否完整（不要建议补充内容）

## 输出格式要求（非常重要）：
- original 必须是原文中实际存在的内容，不要添加或修改任何字符
- original 应该包含需要修改的逗号及其前后2-4个字
- suggestion 是将 original 中的逗号改为分号后的结果
- context 是包含错误的原文片段

示例输出：
{
  "issues": [
    {
      "type": "punctuation",
      "location": "本周工作第1条",
      "context": "按时序要求推进居委换届，已完成6个社区选举委员会推选",
      "original": "换届，已完成",
      "suggestion": "换届；已完成"
    }
  ]
}

没有问题时返回 {"issues": []}
只返回 JSON，不要其他内容。"""

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


async def get_typo_prompt() -> Optional[str]:
    """获取自定义错字检查 Prompt，如果没有自定义则返回 None"""
    try:
        async with async_session() as session:
            result = await session.execute(
                select(SystemConfig).where(SystemConfig.key == "prompt_config")
            )
            config = result.scalar_one_or_none()
            if config:
                data = json.loads(config.value)
                custom_prompt = data.get("typo_prompt", "")
                if custom_prompt and custom_prompt.strip():
                    return custom_prompt
    except Exception as e:
        print(f"Failed to load typo prompt: {e}")
    return None


async def get_punctuation_prompt() -> Optional[str]:
    """获取自定义标点检查 Prompt，如果没有自定义则返回 None"""
    try:
        async with async_session() as session:
            result = await session.execute(
                select(SystemConfig).where(SystemConfig.key == "prompt_config")
            )
            config = result.scalar_one_or_none()
            if config:
                data = json.loads(config.value)
                custom_prompt = data.get("punctuation_prompt", "")
                if custom_prompt and custom_prompt.strip():
                    return custom_prompt
    except Exception as e:
        print(f"Failed to load punctuation prompt: {e}")
    return None


# 默认每日动态优化 Prompt
DEFAULT_DAILY_OPTIMIZE_PROMPT = """你是一个政府公文校对专家，负责优化每日动态的格式和内容。

## 核心原则
1. **分号原则：** 每个独立事件后必须使用分号（；）
2. **句号原则：** 某位领导的全部动态结束后，使用句号（。）
3. **层级对齐：** 如果分管领导参加了主任的会议或活动，必须统一使用主任的完整名称

## 检查和修正项目

### 格式修正
- 事件间用分号（；），结尾用句号（。）
- 删除句内多余逗号
- 删除"今天"、"今日"等冗余词语
- 修正不通顺的短语或语病
- 确保专业术语表述正确（如"农业农村局"而非"农村农业局"）

### 层级对齐（重要）
- 检查主任（通常是第一位，如志明同志）的行程中的会议和活动名称
- 如果其他领导参加了主任的会议或活动，必须使用完整一致的名称
- 区分"主持召开"和"参加"：主持人写"主持召开xxx会议"，参会者写"参加xxx会议"
- 陪同活动的描述必须与被陪同者的内容一致

## 输出格式
直接返回优化后的完整文本，保持原有的序号格式（1、2、3、...）。
不要添加任何解释或说明，只返回优化后的文本。"""


async def get_daily_optimize_prompt() -> str:
    """获取每日动态优化 Prompt（从 prompt_config 中读取）"""
    try:
        async with async_session() as session:
            result = await session.execute(
                select(SystemConfig).where(SystemConfig.key == "prompt_config")
            )
            config = result.scalar_one_or_none()
            if config:
                data = json.loads(config.value)
                custom_prompt = data.get("daily_optimize_prompt", "")
                if custom_prompt and custom_prompt.strip():
                    return custom_prompt
    except Exception as e:
        print(f"Failed to load daily optimize prompt: {e}")
    return DEFAULT_DAILY_OPTIMIZE_PROMPT


# 默认周小结生成 Prompt
DEFAULT_WEEKLY_SUMMARY_PROMPT = """你是一个政府公文写作助手，负责根据每日动态生成周小结的"本周工作"部分。

## 输入
你会收到某位领导一周内的每日动态记录，格式为：
日期: 动态内容

## 输出要求
1. 将每日动态整合为周小结格式，合并相似或重复的工作内容
2. 每条工作用"数字."格式标记（1. 2. 3. ...）
3. 每条工作内容应完整描述工作进展，使用"已完成"、"持续跟进"、"牵头开展"等动词开头
4. 同一条工作中如有多个相关事项，用分号（；）分隔
5. 每条工作以句号（。）结尾
6. 保持原有的专业术语和表述，语言简洁、正式
7. 按工作类型或重要性排序
8. **篇幅控制：总条数不超过9条**，如果内容较多，需要进一步合并归类

## 输出格式示例
1.已完成党组织选举后续资料报告完善工作，按时序要求推进居委换届；已完成6个社区选举委员会推选，以及方案完善等工作。
2.已组织对6个社区开展消防安全、防火安全督查。
3.持续跟进综治中心项目审批。
4.已组织完成各分管领导、室办、社区开展年度总结撰写。
5.牵头持续开展年度考核对接工作。

## 注意
- 直接返回整合后的工作内容，不要添加任何解释或说明
- 不要输出标题或前缀，只输出工作条目列表
- 条目数量控制在5-9条之间，过多时需合并同类工作"""


async def get_weekly_summary_prompt() -> str:
    """获取周小结生成 Prompt（从 prompt_config 中读取）"""
    try:
        async with async_session() as session:
            result = await session.execute(
                select(SystemConfig).where(SystemConfig.key == "prompt_config")
            )
            config = result.scalar_one_or_none()
            if config:
                data = json.loads(config.value)
                custom_prompt = data.get("weekly_summary_prompt", "")
                if custom_prompt and custom_prompt.strip():
                    return custom_prompt
    except Exception as e:
        print(f"Failed to load weekly summary prompt: {e}")
    return DEFAULT_WEEKLY_SUMMARY_PROMPT
