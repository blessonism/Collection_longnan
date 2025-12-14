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
