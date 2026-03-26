from __future__ import annotations

import logging
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.response import success_response
from app.routers import (
    auth_router,
    budget_router,
    circles_router,
    savings_router,
    stats_router,
    transactions_router,
)

app = FastAPI(title="Bookkeeping API", version="0.1.0")
logger = logging.getLogger("bookkeeping.api")

allowed_origins = {
    "https://bookkeeping.neobee.top",
    "capacitor://localhost",
    "ionic://localhost",
    "http://localhost",
    "https://localhost",
    "http://127.0.0.1",
    "https://127.0.0.1",
    "http://localhost:5173",
    "https://localhost:5173",
    "http://127.0.0.1:5173",
    "https://127.0.0.1:5173",
}

extra_origins = os.getenv("CORS_EXTRA_ORIGINS", "")
for origin in extra_origins.split(","):
    normalized = origin.strip()
    if normalized:
        allowed_origins.add(normalized)

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allowed_origins),
    allow_origin_regex=r"^(https?|capacitor|ionic)://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "data": None, "message": str(exc.detail)},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    first_error = exc.errors()[0] if exc.errors() else {}
    message = first_error.get("msg", "请求参数错误")
    return JSONResponse(
        status_code=422,
        content={"success": False, "data": None, "message": message},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"success": False, "data": None, "message": "服务器内部错误"},
    )


app.include_router(auth_router)
app.include_router(transactions_router)
app.include_router(stats_router)
app.include_router(budget_router)
app.include_router(savings_router)
app.include_router(circles_router, prefix="/api/v1", tags=["circles"])


@app.get("/health")
def health_check() -> dict:
    return success_response(data={"status": "ok"})
