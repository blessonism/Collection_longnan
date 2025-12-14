from __future__ import annotations
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models.submission import Submission
from app.schemas import CheckResult, CheckIssue
from app.services.checker import deepseek_checker, rule_checker, punctuation_ai_checker
import asyncio
import json

router = APIRouter(prefix="/api/check", tags=["check"])

class ContentCheckRequest(BaseModel):
    text: str


def split_content_sections(content: str) -> list[str]:
    """将内容按段落分割，确保AI能充分检查每个部分"""
    sections = []
    
    # 尝试按"本周工作"和"下周计划"分割
    if "本周工作" in content and "下周计划" in content:
        parts = content.split("下周计划")
        if len(parts) == 2:
            sections.append(parts[0].strip())  # 本周工作部分
            sections.append("下周计划" + parts[1].strip())  # 下周计划部分
    
    # 如果无法分割，返回原内容
    if not sections:
        sections = [content]
    
    return sections


class AICheckError(Exception):
    """AI 检查错误"""
    pass


async def combined_check(content: str) -> list[CheckIssue]:
    """组合规则检查和AI检查，AI失败时抛出异常"""
    all_issues = []
    ai_errors = []
    
    # 1. 规则检查（快速、确定性）- 处理格式和简单标点
    rule_issues = await rule_checker.check(content)
    all_issues.extend(rule_issues)
    print(f"[Pipeline] Rule checker found {len(rule_issues)} issues")
    
    # 2. 分段进行 AI 检查，避免长文本遗漏
    sections = split_content_sections(content)
    print(f"[Pipeline] Split content into {len(sections)} sections for AI check")
    
    # 3. 对每个段落并行执行 AI 错字检查和标点检查
    ai_tasks = []
    for section in sections:
        ai_tasks.append(deepseek_checker.check(section))
        ai_tasks.append(punctuation_ai_checker.check(section))
    
    ai_results = await asyncio.gather(*ai_tasks, return_exceptions=True)
    
    typo_count = 0
    punctuation_count = 0
    for i, result in enumerate(ai_results):
        if isinstance(result, ValueError):
            # AI 检查失败（重试后仍失败）
            ai_errors.append(str(result))
            print(f"[Pipeline] AI task {i} failed after retry: {result}")
            continue
        if isinstance(result, Exception):
            print(f"[Pipeline] AI task {i} failed: {result}")
            continue
        if isinstance(result, list):
            # 偶数索引是错字检查，奇数索引是标点检查
            if i % 2 == 0:
                typo_count += len(result)
            else:
                punctuation_count += len(result)
            all_issues.extend(result)
    
    # 如果有 AI 错误，抛出异常
    if ai_errors:
        raise AICheckError("; ".join(ai_errors))
    
    print(f"[Pipeline] AI typo checker found {typo_count} issues")
    print(f"[Pipeline] AI punctuation checker found {punctuation_count} issues")
    
    # 4. 去重（基于 location + original + suggestion）
    seen = set()
    unique_issues = []
    for issue in all_issues:
        key = (issue.location, issue.original, issue.suggestion)
        if key not in seen:
            seen.add(key)
            unique_issues.append(issue)
    
    print(f"[Pipeline] Total unique issues: {len(unique_issues)}")
    return unique_issues


class BatchCheckRequest(BaseModel):
    submission_ids: List[int]


@router.post("/batch")
async def batch_check_submissions(request: BatchCheckRequest, db: AsyncSession = Depends(get_db)):
    """批量校对多个提交记录"""
    success_count = 0
    failed_count = 0
    
    for submission_id in request.submission_ids:
        try:
            result = await db.execute(select(Submission).where(Submission.id == submission_id))
            submission = result.scalar_one_or_none()
            
            if not submission:
                failed_count += 1
                continue
            
            # 组合内容进行校对
            content = f"""本周工作：
{submission.weekly_work}

下周计划：
{submission.next_week_plan}"""
            
            try:
                issues = await combined_check(content)
                check_result = {"total_issues": len(issues), "issues": [i.model_dump() for i in issues]}
                
                # 更新校对结果
                submission.check_result = check_result
                submission.status = "checked"
                await db.commit()
                success_count += 1
            except AICheckError:
                failed_count += 1
                continue
        except Exception as e:
            print(f"Batch check error for submission {submission_id}: {e}")
            failed_count += 1
    
    return {"success": success_count, "failed": failed_count}


@router.post("/content", response_model=CheckResult)
async def check_content(request: ContentCheckRequest):
    """通用内容校对接口（规则检查 + AI检查）"""
    try:
        issues = await combined_check(request.text)
        return CheckResult(total_issues=len(issues), issues=issues)
    except AICheckError as e:
        raise HTTPException(status_code=500, detail=f"AI 校对失败: {str(e)}")


@router.post("/content/stream")
async def check_content_stream(request: ContentCheckRequest):
    """带进度的内容校对接口（SSE）"""
    
    async def generate():
        all_issues = []
        content = request.text
        
        # 步骤1: 规则检查
        yield f"data: {json.dumps({'step': 'rule', 'message': '正在检查格式与标点规范...'})}\n\n"
        
        try:
            rule_issues = await rule_checker.check(content)
            all_issues.extend(rule_issues)
            yield f"data: {json.dumps({'step': 'rule', 'completed': True, 'message': '格式规范检查完成'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'step': 'rule', 'error': f'规则检查失败: {str(e)}'})}\n\n"
        
        # 步骤2: 分段
        sections = split_content_sections(content)
        has_two_sections = len(sections) == 2
        
        # 步骤3-4: AI 检查 - 本周工作
        yield f"data: {json.dumps({'step': 'typo_weekly', 'message': '正在分析本周工作内容...'})}\n\n"
        
        try:
            typo_issues_1 = await deepseek_checker.check(sections[0])
            all_issues.extend(typo_issues_1)
        except Exception as e:
            yield f"data: {json.dumps({'step': 'typo_weekly', 'error': str(e)})}\n\n"
        
        yield f"data: {json.dumps({'step': 'punct_weekly', 'message': '正在优化本周工作表达...'})}\n\n"
        
        try:
            punct_issues_1 = await punctuation_ai_checker.check(sections[0])
            all_issues.extend(punct_issues_1)
            yield f"data: {json.dumps({'step': 'punct_weekly', 'completed': True, 'message': '本周工作分析完成'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'step': 'punct_weekly', 'error': str(e)})}\n\n"
        
        # 如果有下周计划
        if has_two_sections:
            # 步骤5-6: AI 检查 - 下周计划
            yield f"data: {json.dumps({'step': 'typo_next', 'message': '正在分析下周计划内容...'})}\n\n"
            
            try:
                typo_issues_2 = await deepseek_checker.check(sections[1])
                all_issues.extend(typo_issues_2)
            except Exception as e:
                yield f"data: {json.dumps({'step': 'typo_next', 'error': str(e)})}\n\n"
            
            yield f"data: {json.dumps({'step': 'punct_next', 'message': '正在优化下周计划表达...'})}\n\n"
            
            try:
                punct_issues_2 = await punctuation_ai_checker.check(sections[1])
                all_issues.extend(punct_issues_2)
                yield f"data: {json.dumps({'step': 'punct_next', 'completed': True, 'message': '下周计划分析完成'})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'step': 'punct_next', 'error': str(e)})}\n\n"
        
        # 步骤7: 去重并返回结果
        seen = set()
        unique_issues = []
        for issue in all_issues:
            key = (issue.location, issue.original, issue.suggestion)
            if key not in seen:
                seen.add(key)
                unique_issues.append(issue)
        
        result = CheckResult(total_issues=len(unique_issues), issues=unique_issues)
        yield f"data: {json.dumps({'step': 'done', 'completed': True, 'message': '智能校对完成', 'result': result.model_dump()})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


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
    
    try:
        issues = await combined_check(content)
    except AICheckError as e:
        raise HTTPException(status_code=500, detail=f"AI 校对失败: {str(e)}")
    
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