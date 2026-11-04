from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi import Path as ApiPath
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.requests import ClientDisconnect

from app.catalog_api import catalog_routes
from app.database import Item, Job
from app.library import Library
from app.maintenance_api import maintenance_routes
from app.security import BodyTooLarge
from app.storage import MAX_FILE, MAX_FILES, StorageError, flush_file, owned

Id = Annotated[str, ApiPath(pattern=r"^[0-9a-f]{32}$")]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class LibraryChoice(StrictModel):
    path: str = Field(min_length=1, max_length=4096)


class ManifestFile(StrictModel):
    name: str = Field(min_length=1, max_length=260)
    size: int = Field(ge=0, le=16 * 1024**3)
    modified_ms: float | None = Field(default=None, ge=0, le=32503680000000, allow_inf_nan=False)


class Manifest(StrictModel):
    files: list[ManifestFile] = Field(min_length=1, max_length=MAX_FILES)


def routes(library: Library) -> APIRouter:
    api = APIRouter()
    api.include_router(catalog_routes(library.catalog))
    api.include_router(maintenance_routes(library.tasks))

    @api.get("/library/location")
    def location() -> dict:
        root = library.library_root()
        return {"path": str(root) if root else None}

    @api.get("/library")
    def summary() -> dict:
        return library.summary()

    @api.post("/library")
    def configure(choice: LibraryChoice) -> dict:
        return library.configure(choice.path)

    @api.post("/jobs")
    def create(manifest: Manifest) -> dict:
        return library.create_job([entry.model_dump() for entry in manifest.files])

    @api.get("/jobs/latest")
    def latest() -> dict | None:
        return library.latest()

    @api.get("/jobs/{identifier}")
    def job(identifier: Id) -> dict:
        return library.job(identifier)

    @api.post("/jobs/{identifier}/cancel")
    def cancel(identifier: Id) -> dict:
        return library.cancel(identifier)

    @api.post("/jobs/{identifier}/retry")
    def retry(identifier: Id) -> dict:
        return library.retry(identifier)

    @api.put("/uploads/{identifier}")
    async def upload(identifier: Id, request: Request) -> dict:
        with library.lock, library.db.session.begin() as session:
            item = session.get(Item, identifier)
            if not item or item.state != "pending":
                raise HTTPException(409, "This file is not waiting for a copy.")
            job = session.get(Job, item.job_id)
            if job.cancelled:
                raise HTTPException(409, "This import was cancelled.")
            expected = item.size
            if int(request.headers.get("content-length", "0")) != expected:
                raise HTTPException(400, "The source file size changed. Select it again.")
            item.state = "receiving"
            job_id = item.job_id
        partial = owned(library.staging, identifier + ".part")
        received = 0
        try:
            with partial.open("xb") as target:
                async for chunk in request.stream():
                    received += len(chunk)
                    if received > expected or received > MAX_FILE:
                        raise StorageError("The file changed or exceeds the size limit.")
                    with library.db.session() as session:
                        if session.get(Job, job_id).cancelled:
                            raise StorageError(
                                "Import cancelled. Your source file was not changed."
                            )
                    target.write(chunk)
                flush_file(target)
            if received != expected:
                raise StorageError("The file copy was incomplete. Select it again.")
            partial.rename(owned(library.staging, identifier + ".stage"))
            with library.lock, library.db.session.begin() as session:
                item = session.get(Item, identifier)
                if session.get(Job, job_id).cancelled:
                    item.state, item.reason = (
                        "cancelled",
                        "Cancelled. Your source file was not changed.",
                    )
                    library.cleanup(identifier)
                else:
                    item.state = "queued"
            library.wake.set()
            return {"accepted": True}
        except (ClientDisconnect, OSError, StorageError, BodyTooLarge) as exc:
            library.reject(
                identifier,
                str(exc)
                if isinstance(exc, StorageError)
                else "Copy interrupted. Check the source and free space, then select it again.",
            )
            library.cleanup(identifier)
            raise HTTPException(
                400, "This file could not be copied. See its import result."
            ) from exc

    @api.post("/uploads/{identifier}/reject")
    def reject(identifier: Id) -> dict:
        library.reject(
            identifier,
            "The source file could not be read or changed during import. Select it again.",
        )
        return {"accepted": True}

    @api.get("/photos")
    def photos(page: Annotated[int, Query(ge=0, le=100000)] = 0) -> dict:
        return library.photos(page)

    @api.get("/photos/{identifier}/{kind}")
    def image(identifier: Id, kind: str) -> FileResponse:
        if kind not in ("thumbnail", "preview", "display"):
            raise HTTPException(404, "This preview could not be found.")
        path: Path = (
            library.display_path(identifier)
            if kind == "display"
            else library.image_path(identifier, kind == "preview")
        )
        return FileResponse(
            path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"}
        )

    return api
