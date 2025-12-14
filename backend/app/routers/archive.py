from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.database import get_db
from app.models.submission import Submission
from app.schemas import ArchiveConfig
from app.services.archiver import create_archive, generate_manifest_text

router = APIRouter(prefix="/api/archive", tags=["archive"])

@router.post("/")
async def create_archive_package(config: ArchiveConfig, db: AsyncSession = Depends(get_db)):
    """创建归档包"""
    result = await db.execute(
        select(Submission).where(Submission.id.in_(config.submission_ids))
    )
    submissions = result.scalars().all()
    
    if not submissions:
        raise HTTPException(status_code=404, detail="No submissions found")
    
    # 按 ID 顺序排序
    submissions = sorted(submissions, key=lambda x: config.submission_ids.index(x.id))
    
    zip_bytes, manifest = create_archive(
        submissions=submissions,
        naming_template=config.naming_template,
        start_number=config.start_number,
        number_padding=config.number_padding
    )
    
    # 更新状态为已归档
    for sub in submissions:
        sub.status = "archived"
    await db.commit()
    
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=weekly_summary_archive.zip"}
    )

@router.post("/manifest")
async def get_manifest(config: ArchiveConfig, db: AsyncSession = Depends(get_db)):
    """获取文件清单"""
    result = await db.execute(
        select(Submission).where(Submission.id.in_(config.submission_ids))
    )
    submissions = result.scalars().all()
    
    if not submissions:
        raise HTTPException(status_code=404, detail="No submissions found")
    
    submissions = sorted(submissions, key=lambda x: config.submission_ids.index(x.id))
    
    _, manifest = create_archive(
        submissions=submissions,
        naming_template=config.naming_template,
        start_number=config.start_number,
        number_padding=config.number_padding
    )
    
    date_range = submissions[0].date_range if submissions else ""
    manifest_text = generate_manifest_text(manifest, date_range)
    
    return {"manifest": manifest, "manifest_text": manifest_text}
