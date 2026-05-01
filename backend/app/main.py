import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.api import chunks, documents, notes, tts  # noqa: E402


app = FastAPI(title="Pages API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        os.environ["FRONTEND_URL"],
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def api_error(code: str, message: str, details=None) -> dict:
    return {"error": {"code": code, "message": message, "details": details}}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content=api_error("INTERNAL_ERROR", str(exc.detail), None),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=400,
        content=api_error("INVALID_INPUT", "Malformed body or params", exc.errors()),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content=api_error("INTERNAL_ERROR", "Unexpected server error", None),
    )


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


app.include_router(documents.router, prefix="/api/v1")
app.include_router(chunks.router, prefix="/api/v1")
app.include_router(notes.router, prefix="/api/v1")
app.include_router(tts.router, prefix="/api/v1")
