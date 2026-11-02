from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from app.archives import ArchiveTasks


class Location(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    path: str = Field(min_length=1, max_length=4096)


class Restore(Location):
    source: str = Field(min_length=1, max_length=4096)


def maintenance_routes(tasks: ArchiveTasks) -> APIRouter:
    router = APIRouter(prefix="/maintenance")

    @router.get("/status")
    def status() -> dict:
        return tasks.status()

    @router.post("/backup")
    def backup(value: Location) -> dict:
        return tasks.backup(value.path)

    @router.post("/restore")
    def restore(value: Restore) -> dict:
        return tasks.restore(value.source, value.path)

    @router.post("/resume")
    def resume() -> dict:
        return tasks.resume()

    @router.post("/cancel")
    def cancel() -> dict:
        return tasks.cancel()

    return router
