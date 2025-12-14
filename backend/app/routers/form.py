from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.submission import Submission
from app.schemas import SummaryFormCreate, SubmissionResponse, CheckResult
from app.services.checker import deepseek_checker
from app.services.exporter import export_to_word

router = APIRouter(prefix="/api/form", tags=["form"])

@router.post("/submit", response_model=SubmissionResponse)
async def submit_form(form: SummaryFormCreate, db: AsyncSession = Depends(get_db)):
    """提交周小结表单"""
    submission = Submission(
        name=form.name,
        date_range=form.date_range,
        weekly_work=form.weekly_work,
        next_week_plan=form.next_week_plan,
        source="form",
        status="submitted"
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)
    return submission

@router.post("/draft", response_model=SubmissionResponse)
async def save_draft(form: SummaryFormCreate, db: AsyncSession = Depends(get_db)):
    """保存草稿"""
    submission = Submission(
        name=form.name,
        date_range=form.date_range,
        weekly_work=form.weekly_work,
        next_week_plan=form.next_week_plan,
        source="form",
        status="draft"
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)
    return submission

@router.get("/export/{submission_id}")
async def export_submission(submission_id: int, db: AsyncSession = Depends(get_db)):
    """导出为 Word 文档"""
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    submission = result.scalar_one_or_none()
    
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    doc_bytes = export_to_word(
        name=submission.name,
        date_range=submission.date_range,
        weekly_work=submission.weekly_work,
        next_week_plan=submission.next_week_plan
    )
    
    filename = f"{submission.name}_周小结_{submission.date_range.replace('.', '_')}.docx"
    # 使用 URL 编码处理中文文件名
    from urllib.parse import quote
    encoded_filename = quote(filename)
    
    return Response(
        content=doc_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"}
    )
