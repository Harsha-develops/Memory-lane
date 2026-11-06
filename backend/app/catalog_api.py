from datetime import date
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.catalog import Catalog


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Dates(Strict):
    start: str | None = None
    end: str | None = None

    @field_validator("start", "end")
    @classmethod
    def validate_date(cls, value: str | None) -> str | None:
        if value is not None:
            date.fromisoformat(value)
        return value


class Query(Dates):
    offset: int = Field(default=0, ge=0, le=1000000)
    limit: int = Field(default=48, ge=1, le=200)
    trip: str | None = Field(default=None, pattern=r"^(?:[0-9a-f]{32}|unassigned)$")
    search: str = Field(default="", max_length=100)
    tag: str = Field(default="", max_length=40)
    uncategorized: bool = False


class TripInput(Dates):
    kind: Literal["trip", "album"] | None = None
    id: str | None = Field(default=None, pattern=r"^[0-9a-f]{32}$")
    title: str = Field(min_length=1, max_length=120)


class Identifier(Strict):
    id: str = Field(pattern=r"^[0-9a-f]{32}$")


class Organize(Identifier):
    label: str = Field(pattern=r"^[a-z0-9][a-z0-9 -]{0,39}$")


class Tags(Identifier):
    tags: list[str] = Field(max_length=64)


class AutoCategories(Tags):
    scope: list[str] = Field(max_length=64)


class PersonName(Strict):
    label: str = Field(pattern=r"^person [1-9][0-9]{0,5}$")
    name: str = Field(min_length=1, max_length=80)


class CategoryName(Strict):
    label: str = Field(pattern=r"^[a-z][a-z0-9 -]{0,39}$")
    name: str = Field(min_length=1, max_length=40)


class Move(Strict):
    ids: list[str] = Field(min_length=1, max_length=500)
    trip: str | None = Field(default=None, pattern=r"^[0-9a-f]{32}$")

    @field_validator("ids")
    @classmethod
    def validate_ids(cls, values: list[str]) -> list[str]:
        for value in values:
            Identifier(id=value)
        return values


class SaveAlbum(Move):
    parent: str = Field(min_length=1, max_length=1000)


class SavePhoto(Identifier):
    batch: str = Field(pattern=r"^[0-9a-f]{32}$")


class Cover(Identifier):
    photo: str = Field(pattern=r"^[0-9a-f]{32}$")


class Privacy(Strict):
    showGps: bool
    storeGps: bool


class Review(Identifier):
    decision: Literal["keep", "similar"]


class Grouping(Strict):
    grouping: Literal["trip", "month"]


def catalog_routes(catalog: Catalog) -> APIRouter:
    router = APIRouter(prefix="/catalog")

    @router.post("/query")
    def query(value: Query) -> dict:
        return catalog.query(**value.model_dump())

    @router.post("/detail")
    def detail(value: Identifier) -> dict:
        return catalog.detail(value.id)

    @router.post("/tags")
    def save_tags(value: Tags) -> dict:
        return catalog.save_tags(value.id, value.tags)

    @router.post("/save-album")
    def save_album(value: SaveAlbum) -> dict:
        return catalog.library.saver.prepare(value.ids, value.parent)

    @router.post("/save-photo")
    def save_photo(value: SavePhoto) -> dict:
        return catalog.library.saver.move(value.id, value.batch)

    @router.post("/correct-category")
    def correct_category(value: Organize) -> dict:
        return catalog.correct_category(value.id, value.label)

    @router.post("/organize")
    def organize(value: Organize) -> dict:
        return catalog.library.organizer.move(value.id, value.label)

    @router.post("/auto-categories")
    def auto_categories(value: AutoCategories) -> dict:
        return catalog.auto_categories(value.id, value.tags, value.scope)

    @router.get("/category-names")
    def category_names() -> dict:
        return catalog.category_names()

    @router.post("/category-name")
    def category_name(value: CategoryName) -> dict:
        return catalog.rename_category(value.label, value.name)

    @router.get("/albums")
    def albums() -> list[dict]:
        return catalog.albums()

    @router.get("/person-names")
    def person_names() -> dict:
        return catalog.person_names()

    @router.post("/person-name")
    def rename_person(value: PersonName) -> dict:
        return catalog.rename_person(value.label, value.name)

    @router.get("/categories")
    def categories() -> list[dict]:
        return catalog.categories()

    @router.get("/people")
    def people() -> list[dict]:
        return catalog.people()

    @router.post("/person-reference")
    def new_person(value: Identifier) -> dict:
        return catalog.new_person(value.id)

    @router.post("/person-reference/remove")
    def remove_person(value: Identifier) -> dict:
        return catalog.remove_person_reference(value.id)

    @router.get("/trips")
    def trips() -> list[dict]:
        return catalog.trips()

    @router.post("/trip")
    def save(value: TripInput) -> dict:
        return catalog.save_trip(value.title, value.start, value.end, value.id, value.kind)

    @router.post("/trip/delete")
    def delete(value: Identifier) -> dict:
        return catalog.delete_trip(value.id)

    @router.post("/move")
    def move(value: Move) -> dict:
        return catalog.move(value.ids, value.trip)

    @router.post("/cover")
    def cover(value: Cover) -> dict:
        return catalog.cover(value.id, value.photo)

    @router.post("/group-dates")
    def group_dates() -> dict:
        return catalog.group_dates()

    @router.post("/orbit")
    def orbit(value: Grouping) -> dict:
        return catalog.orbit(value.grouping)

    @router.get("/privacy")
    def privacy() -> dict:
        return catalog.privacy()

    @router.post("/privacy")
    def privacy_update(value: Privacy) -> dict:
        return catalog.set_privacy(value.showGps, value.storeGps)

    @router.post("/forget-locations")
    def forget() -> dict:
        return catalog.forget_locations()

    @router.get("/similar")
    def similar() -> dict:
        return catalog.similar()

    @router.post("/similar/scan")
    def scan() -> dict:
        return catalog.scan_similar()

    @router.post("/similar/review")
    def review(value: Review) -> dict:
        return catalog.review_pair(value.id, value.decision)

    return router
