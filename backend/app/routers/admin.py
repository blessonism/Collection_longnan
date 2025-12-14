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
    check_missing_number: bool = True  # 检查缺少序号
    check_extra_spaces: bool = True
    check_english_punctuation: bool = True
    check_slash_to_semicolon: bool = True
    check_consecutive_punctuation: bool = True
    check_ending_punctuation: bool = True
    check_english_brackets: bool = True


class PromptConfig(BaseModel):
    """AI Prompt 配置"""
    typo_prompt: str = ""  # 错字检查器 prompt
    punctuation_prompt: str = ""  # 标点检查器 prompt
    daily_optimize_prompt: str = ""  # 每日动态优化 prompt
    check_typo: bool = True
    check_punctuation_semantic: bool = True


# 默认配置
DEFAULT_RULE_CONFIG = RuleConfig()


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
    from app.services.checker.deepseek_checker import TYPO_PROMPT
    from app.services.checker.punctuation_ai_checker import PUNCTUATION_PROMPT
    from app.services.checker.config_loader import DEFAULT_DAILY_OPTIMIZE_PROMPT
    
    result = await db.execute(select(SystemConfig).where(SystemConfig.key == "prompt_config"))
    config = result.scalar_one_or_none()
    
    if config:
        saved = json.loads(config.value)
        # 兼容旧格式，如果没有新字段或为空则使用默认值
        typo = saved.get("typo_prompt", "")
        punct = saved.get("punctuation_prompt", "")
        daily = saved.get("daily_optimize_prompt", "")
        return {
            "typo_prompt": typo if typo and typo.strip() else TYPO_PROMPT,
            "punctuation_prompt": punct if punct and punct.strip() else PUNCTUATION_PROMPT,
            "daily_optimize_prompt": daily if daily and daily.strip() else DEFAULT_DAILY_OPTIMIZE_PROMPT,
            "check_typo": saved.get("check_typo", True),
            "check_punctuation_semantic": saved.get("check_punctuation_semantic", True),
        }
    return {
        "typo_prompt": TYPO_PROMPT,
        "punctuation_prompt": PUNCTUATION_PROMPT,
        "daily_optimize_prompt": DEFAULT_DAILY_OPTIMIZE_PROMPT,
        "check_typo": True,
        "check_punctuation_semantic": True
    }


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
