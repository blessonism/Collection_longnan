from app.routers.form import router as form_router
from app.routers.check import router as check_router
from app.routers.submission import router as submission_router
from app.routers.archive import router as archive_router
from app.routers.admin import router as admin_router
from app.routers.daily import router as daily_router

__all__ = ["form_router", "check_router", "submission_router", "archive_router", "admin_router", "daily_router"]
