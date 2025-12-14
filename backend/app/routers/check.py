from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models.submission import Submission
from app.schemas import CheckResult, CheckIssue
from app.services.checker import deepseek_checker, rule_checker

router = APIRouter(prefix="/api/check", tags=["check"])

class ContentCheckRequest(BaseModel):
    text: str


async def combined_check(content: str) -> list[CheckIssue]:
    """组合规则检查和AI检查"""
    all_issues = []
    
    # 1. 先执行规则检查（快速、确定性）
    rule_issues = await rule_checker.check(content)
    all_issues.extend(rule_issues)
    print(f"Rule checker found {len(rule_issues)} issues")
    
    # 2. 再执行AI检查（错别字、语义）
    ai_issues = await deepseek_checker.check(content)
    all_issues.extend(ai_issues)
    print(f"AI checker found {len(ai_issues)} issues")
    
    # 3. 去重（基于 location + original + suggestion）
    seen = set()
    unique_issues = []
    for issue in all_issues:
        key = (issue.location, issue.original, issue.suggestion)
        if key not in seen:
            seen.add(key)
            unique_issues.append(issue)
    
    print(f"Total unique issues: {len(unique_issues)}")
    return unique_issues


@router.post("/content", response_model=CheckResult)
async def check_content(request: ContentCheckRequest):
    """通用内容校对接口（规则检查 + AI检查）"""
    issues = await combined_check(request.text)
    return CheckResult(total_issues=len(issues), issues=issues)


@router.post("/{submission_id}", response_model=CheckResult)
async def check_submission(submission_id: int, db: AsyncSession = Depends(get_db)):
    """校对指定提交记录"""
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    submission = result.scalar_one_or_none()
    
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    # 组合内容进行校对
    content = f"""本周工作：
{submission.weekly_work}

下周计划：
{submission.next_week_plan}"""
    
    issues = await combined_check(content)
    check_result = {"total_issues": len(issues), "issues": [i.model_dump() for i in issues]}
    
    # 更新校对结果
    submission.check_result = check_result
    submission.status = "checked"
    await db.commit()
    
    return CheckResult(total_issues=len(issues), issues=issues)

@router.get("/{submission_id}/result", response_model=CheckResult)
async def get_check_result(submission_id: int, db: AsyncSession = Depends(get_db)):
    """获取校对结果"""
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    submission = result.scalar_one_or_none()
    
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    if not submission.check_result:
        return CheckResult(total_issues=0, issues=[])
    
    return CheckResult(**submission.check_result)
