from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# 表单提交
class SummaryFormCreate(BaseModel):
    name: str
    date_range: str
    weekly_work: str
    next_week_plan: str

class SummaryFormDraft(SummaryFormCreate):
    pass

# 校对结果
class CheckIssue(BaseModel):
    type: str  # typo | punctuation | grammar | format
    severity: str  # error | warning | info
    location: str
    context: str = ""  # 包含错误的上下文
    original: str
    suggestion: str

class CheckResult(BaseModel):
    total_issues: int
    issues: List[CheckIssue]

# 提交记录
class SubmissionResponse(BaseModel):
    id: int
    name: str
    date_range: str
    weekly_work: str
    next_week_plan: str
    source: str
    status: str
    check_result: Optional[dict] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

# 归档配置
class ArchiveConfig(BaseModel):
    submission_ids: List[int]
    naming_template: str = "{序号}_{姓名}_周小结_{日期范围}"
    start_number: int = 1
    number_padding: int = 2
