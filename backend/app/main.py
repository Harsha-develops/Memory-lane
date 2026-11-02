"""Typed local API; the shell is the only network client."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.exc import SQLAlchemyError

from app import __version__
from app.api import routes
from app.library import Library
from app.security import LocalOnlyMiddleware
from app.storage import StorageError


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    status: str = "ok"
    version: str = __version__


def create_app(token: str, rate_limit: int = 1200, data_root: Path | None = None) -> FastAPI:
    if len(token) != 64 or any(c not in "0123456789abcdef" for c in token):
        raise ValueError("A valid per-launch token is required.")
    library = Library(data_root) if data_root else None

    @asynccontextmanager
    async def lifespan(_api: FastAPI):
        if library:
            library.start()
        try:
            yield
        finally:
            if library:
                library.close()

    api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    api.add_middleware(LocalOnlyMiddleware, token=token, rate_limit=rate_limit)
    if library:
        api.include_router(routes(library))
        api.state.library = library

    @api.exception_handler(StorageError)
    async def storage_error(_request: Request, error: StorageError) -> JSONResponse:
        return JSONResponse({"detail": str(error)}, status_code=400)

    @api.exception_handler(OSError)
    @api.exception_handler(SQLAlchemyError)
    async def disk_error(_request: Request, _error: Exception) -> JSONResponse:
        return JSONResponse(
            {"detail": "The library drive is unavailable or full. Check it and try again."},
            status_code=503,
        )

    @api.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse()

    return api
