from app.routers.auth import router as auth_router
from app.routers.budget import router as budget_router
from app.routers.circles import router as circles_router
from app.routers.savings import router as savings_router
from app.routers.stats import router as stats_router
from app.routers.transactions import router as transactions_router

__all__ = [
    "auth_router",
    "budget_router",
    "circles_router",
    "savings_router",
    "stats_router",
    "transactions_router",
]
