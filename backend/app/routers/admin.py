"""管理员接口"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import secrets
import json

from app.database import get_db
from app.models.config import SystemConfig
from app.config import settings

router = APIRouter(prefix="/api/admin", tags=["admin"])
security = HTTPBasic()


def verify_admin(credentials: HTTPBasicCredentials = Depends(security)):
    """验证管理员身份"""
    correct_username = secrets.compare_digest(credentials.username, settings.ADMIN_USERNAME)
    correct_password = secrets.compare_digest(credentials.password, settings.ADMIN_PASSWORD)
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


class ConfigUpdate(BaseModel):
    value: str
    description: Optional[str] = None


class RuleConfig(BaseModel):
    """规则检查配置"""
    check_number_format: bool = True
    check_extra_spaces: bool = True
    check_english_punctuation: bool = True
    check_slash_to_semicolon: bool = True
    check_consecutive_punctuation: bool = True
    check_ending_punctuation: bool = True
    check_english_brackets: bool = True


class PromptConfig(BaseModel):
    """AI Prompt 配置"""
    system_prompt: str
    check_typo: bool = True
    check_punctuation_semantic: bool = True


# 默认配置
DEFAULT_RULE_CONFIG = RuleConfig()
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


@router.get("/verify")
async def verify_login(username: str = Depends(verify_admin)):
    """验证管理员登录"""
    return {"status": "ok", "username": username}


@router.get("/config/{key}")
async def get_config(
    key: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_admin)
):
    """获取配置项"""
    result = await db.execute(select(SystemConfig).where(SystemConfig.key == key))
    config = result.scalar_one_or_none()
    
    if not config:
        # 返回默认值
        if key == "rule_config":
            return {"key": key, "value": DEFAULT_RULE_CONFIG.model_dump()}
        elif key == "prompt_config":
            return {"key": key, "value": {"system_prompt": DEFAULT_PROMPT, "check_typo": True, "check_punctuation_semantic": True}}
        raise HTTPException(status_code=404, detail="配置不存在")
    
    return {"key": config.key, "value": json.loads(config.value), "description": config.description}


@router.put("/config/{key}")
async def update_config(
    key: str,
    update: ConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_admin)
):
    """更新配置项"""
    result = await db.execute(select(SystemConfig).where(SystemConfig.key == key))
    config = result.scalar_one_or_none()
    
    if config:
        config.value = update.value
        if update.description:
            config.description = update.description
    else:
        config = SystemConfig(key=key, value=update.value, description=update.description)
        db.add(config)
    
    await db.commit()
    return {"status": "ok", "key": key}


@router.get("/rules")
async def get_rules(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_admin)
):
    """获取规则配置"""
    result = await db.execute(select(SystemConfig).where(SystemConfig.key == "rule_config"))
    config = result.scalar_one_or_none()
    
    if config:
        return json.loads(config.value)
    return DEFAULT_RULE_CONFIG.model_dump()


@router.put("/rules")
async def update_rules(
    rules: RuleConfig,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_admin)
):
    """更新规则配置"""
    result = await db.execute(select(SystemConfig).where(SystemConfig.key == "rule_config"))
    config = result.scalar_one_or_none()
    
    value = json.dumps(rules.model_dump())
    if config:
        config.value = value
    else:
        config = SystemConfig(key="rule_config", value=value, description="规则检查配置")
        db.add(config)
    
    await db.commit()
    return {"status": "ok"}


@router.get("/prompt")
async def get_prompt(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_admin)
):
    """获取 AI Prompt 配置"""
    result = await db.execute(select(SystemConfig).where(SystemConfig.key == "prompt_config"))
    config = result.scalar_one_or_none()
    
    if config:
        return json.loads(config.value)
    return {"system_prompt": DEFAULT_PROMPT, "check_typo": True, "check_punctuation_semantic": True}


@router.put("/prompt")
async def update_prompt(
    prompt: PromptConfig,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_admin)
):
    """更新 AI Prompt 配置"""
    result = await db.execute(select(SystemConfig).where(SystemConfig.key == "prompt_config"))
    config = result.scalar_one_or_none()
    
    value = json.dumps(prompt.model_dump())
    if config:
        config.value = value
    else:
        config = SystemConfig(key="prompt_config", value=value, description="AI Prompt 配置")
        db.add(config)
    
    await db.commit()
    return {"status": "ok"}


@router.post("/reset")
async def reset_config(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_admin)
):
    """重置所有配置为默认值"""
    # 删除所有配置
    result = await db.execute(select(SystemConfig))
    configs = result.scalars().all()
    for config in configs:
        await db.delete(config)
    await db.commit()
    return {"status": "ok", "message": "已重置为默认配置"}
