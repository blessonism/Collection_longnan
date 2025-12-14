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
    source: str = "rule"  # rule | ai_typo | ai_punctuation - 问题来源

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

# ========== 每日动态相关 ==========
from datetime import date

# 人员名单
class DailyMemberCreate(BaseModel):
    name: str
    sort_order: int = 0

class DailyMemberUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None

class DailyMemberResponse(BaseModel):
    id: int
    name: str
    sort_order: int
    is_active: bool

    class Config:
        from_attributes = True

class DailyMemberImport(BaseModel):
    names: List[str]  # 批量导入的姓名列表

# 每日动态
class DailyReportCreate(BaseModel):
    member_id: int
    date: date
    content: str

class DailyReportUpdate(BaseModel):
    content: str

class DailyReportResponse(BaseModel):
    id: int
    member_id: int
    member_name: str
    date: date
    content: str

    class Config:
        from_attributes = True

# 每日动态汇总
class DailyReportSummary(BaseModel):
    date: date
    date_display: str  # 如 "12月14日 周六"
    total_members: int
    submitted_count: int
    reports: List[DailyReportResponse]
    summary_text: str  # 格式化的汇总文本
