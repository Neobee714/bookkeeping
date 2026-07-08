from app.routers.agent import router as agent_router
from app.routers.app_updates import router as app_updates_router
from app.routers.categories import router as categories_router
from app.routers.auth import router as auth_router
from app.routers.budget import router as budget_router
from app.routers.circles import router as circles_router
from app.routers.savings import router as savings_router
from app.routers.stats import router as stats_router
from app.routers.transactions import router as transactions_router

__all__ = [
    "agent_router",
    "app_updates_router",
    "auth_router",
    "categories_router",
    "budget_router",
    "circles_router",
    "savings_router",
    "stats_router",
    "transactions_router",
]
