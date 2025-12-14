from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.database import get_db
from app.models.submission import Submission
from app.schemas import SubmissionResponse

router = APIRouter(prefix="/api/submissions", tags=["submissions"])

@router.get("/", response_model=List[SubmissionResponse])
async def list_submissions(
    date_range: str = None,
    status: str = None,
    db: AsyncSession = Depends(get_db)
):
    """获取提交列表"""
    query = select(Submission)
    
    if date_range:
        query = query.where(Submission.date_range == date_range)
    if status:
        query = query.where(Submission.status == status)
    
    query = query.order_by(Submission.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/{submission_id}", response_model=SubmissionResponse)
async def get_submission(submission_id: int, db: AsyncSession = Depends(get_db)):
    """获取单个提交记录"""
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    submission = result.scalar_one_or_none()
    if not submission:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Submission not found")
    return submission

@router.delete("/{submission_id}")
async def delete_submission(submission_id: int, db: AsyncSession = Depends(get_db)):
    """删除提交记录"""
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    submission = result.scalar_one_or_none()
    if not submission:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Submission not found")
    
    await db.delete(submission)
    await db.commit()
    return {"message": "Deleted successfully"}


from pydantic import BaseModel
from typing import Optional

class SubmissionUpdate(BaseModel):
    name: Optional[str] = None
    date_range: Optional[str] = None
    weekly_work: Optional[str] = None
    next_week_plan: Optional[str] = None


@router.put("/{submission_id}", response_model=SubmissionResponse)
async def update_submission(
    submission_id: int,
    update: SubmissionUpdate,
    db: AsyncSession = Depends(get_db)
):
    """更新提交记录"""
    from fastapi import HTTPException
    
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    # 更新字段
    if update.name is not None:
        submission.name = update.name
    if update.date_range is not None:
        submission.date_range = update.date_range
    if update.weekly_work is not None:
        submission.weekly_work = update.weekly_work
    if update.next_week_plan is not None:
        submission.next_week_plan = update.next_week_plan
    
    # 内容修改后清除校对结果
    if update.weekly_work is not None or update.next_week_plan is not None:
        submission.check_result = None
        submission.status = "submitted"
    
    await db.commit()
    await db.refresh(submission)
    return submission


class CheckResultUpdate(BaseModel):
    check_result: dict


@router.put("/{submission_id}/check-result", response_model=SubmissionResponse)
async def update_check_result(
    submission_id: int,
    update: CheckResultUpdate,
    db: AsyncSession = Depends(get_db)
):
    """保存校验结果并更新状态为已校对"""
    from fastapi import HTTPException
    
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    submission.check_result = update.check_result
    submission.status = "checked"
    
    await db.commit()
    await db.refresh(submission)
    return submission
