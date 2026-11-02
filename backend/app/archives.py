"""Explicit portable backups and resumable restoration into an empty collection."""

import hashlib
import json
import os
import threading
import uuid
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError

from app.database import Item, Photo, Setting, Trip
from app.decoders import EXTENSIONS, decode, save_preview
from app.storage import MAX_FILE, StorageError, check_space, owned, safe_local

if TYPE_CHECKING:
    from app.library import Library


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class ArchivedTrip(Record):
    id: str = Field(pattern=r"^[a-f0-9]{32}$")
    title: str = Field(min_length=1, max_length=120)
    start_date: str | None = None
    end_date: str | None = None
    cover_photo_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{32}$")


class ArchivedPhoto(Record):
    tags: list[str] = Field(default_factory=list, max_length=64)
    person_ref: str = Field(default="", pattern=r"^(?:person [1-9][0-9]{0,5})?$")

    @field_validator("tags")
    @classmethod
    def valid_tags(cls, value: list[str]) -> list[str]:
        import re

        if any(not re.fullmatch(r"[a-z0-9][a-z0-9 -]{0,39}", tag) for tag in value):
            raise ValueError("Invalid category")
        return sorted(set(value))

    id: str = Field(pattern=r"^[a-f0-9]{32}$")
    filename: str = Field(min_length=1, max_length=260)
    extension: str = Field(min_length=2, max_length=6)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    size: int = Field(ge=1, le=MAX_FILE)
    imported_at: str = Field(max_length=40)
    captured_at: str = Field(max_length=40)
    date_source: Literal["exif", "file_modified", "import_time"]
    trip_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{32}$")
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @field_validator("extension")
    @classmethod
    def supported(cls, value: str) -> str:
        if value not in EXTENSIONS:
            raise ValueError("Unsupported photo type")
        return value

    @field_validator("imported_at", "captured_at")
    @classmethod
    def valid_date(cls, value: str) -> str:
        datetime.fromisoformat(value)
        return value


class Archive(Record):
    person_names: dict[str, str] = Field(default_factory=dict, max_length=100000)

    @field_validator("person_names")
    @classmethod
    def valid_names(cls, value: dict[str, str]) -> dict[str, str]:
        import re

        if any(
            not re.fullmatch(r"person [1-9][0-9]{0,5}", key) or not name.strip() or len(name) > 80
            for key, name in value.items()
        ):
            raise ValueError("Invalid person names")
        return value

    format: Literal["thing-sorted-backup-v1"] = "thing-sorted-backup-v1"
    photos: list[ArchivedPhoto] = Field(max_length=100000)
    trips: list[ArchivedTrip] = Field(max_length=100000)

    def validate_links(self) -> None:
        references = [p.person_ref for p in self.photos if p.person_ref]
        if len(references) > 8 or len(references) != len(set(references)):
            raise StorageError("This backup has invalid person references.")
        ids = {p.id for p in self.photos}
        trips = {t.id for t in self.trips}
        hashes = {p.sha256 for p in self.photos}
        if (
            len(ids) != len(self.photos)
            or len(hashes) != len(self.photos)
            or len(trips) != len(self.trips)
        ):
            raise StorageError("This backup contains repeated records.")
        if any(p.trip_id and p.trip_id not in trips for p in self.photos):
            raise StorageError("This backup contains an invalid trip assignment.")
        if any(t.cover_photo_id and t.cover_photo_id not in ids for t in self.trips):
            raise StorageError("This backup contains an invalid cover.")


def atomic_json(path: Path, value: dict) -> None:
    safe_local(path, exists=False)
    temporary = owned(path.parent, path.name + ".tmp")
    with temporary.open("w", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)


def read_archive(folder: Path) -> Archive:
    path = owned(folder, "manifest.json")
    if path.stat().st_size > 32 * 1024 * 1024:
        raise StorageError("This backup's catalog is too large.")
    try:
        archive = Archive.model_validate_json(path.read_bytes())
        archive.validate_links()
        return archive
    except (ValidationError, ValueError) as error:
        raise StorageError("This is not a valid thing sorted backup.") from error


class ArchiveTasks:
    def __init__(self, library: "Library") -> None:
        self.library = library
        self.file = owned(library.root, "archive-job.json")
        self.job: dict | None = None
        self.thread: threading.Thread | None = None
        self.cancel_event = threading.Event()
        self.state_lock = threading.RLock()
        if self.file.exists():
            try:
                if self.file.stat().st_size <= 40 * 1024 * 1024:
                    self.job = json.loads(self.file.read_text(encoding="utf-8"))
                    if self.job.get("state") == "running":
                        self.job["state"] = "interrupted"
                        self._save()
            except (OSError, ValueError, AttributeError):
                self.job = None

    def busy(self) -> bool:
        return bool(self.job and self.job.get("state") == "running")

    def status(self) -> dict:
        with self.state_lock:
            if not self.job:
                return {"state": "idle", "kind": None, "done": 0, "total": 0, "message": ""}
            return {key: self.job[key] for key in ("state", "kind", "done", "total", "message")}

    def _save(self) -> None:
        with self.state_lock:
            atomic_json(self.file, self.job)

    def _idle(self) -> None:
        if self.busy():
            raise StorageError("Wait for the current backup or restore to finish.")
        with self.library.db.session() as session:
            active = session.scalar(
                select(Item.id)
                .where(Item.state.in_({"pending", "receiving", "queued", "working"}))
                .limit(1)
            )
            if active:
                raise StorageError("Finish or cancel the current import first.")
        if self.library.catalog.scan_state == "running":
            raise StorageError("Wait for the similarity scan to finish.")

    def backup(self, parent: str) -> dict:
        with self.library.lock:
            self._idle()
            source = self.library.library_root()
            if source is None:
                raise StorageError("Import photos before creating a backup.")
            destination_parent = safe_local(Path(parent))
            if (
                destination_parent == source
                or destination_parent.is_relative_to(source)
                or destination_parent.is_relative_to(self.library.root.parent)
            ):
                raise StorageError("Choose a backup folder outside the app and original library.")
            photos = []
            with self.library.db.session() as session:
                for photo in session.scalars(select(Photo)):
                    path = owned(source / "originals", photo.id + photo.extension)
                    photos.append(
                        ArchivedPhoto(
                            id=photo.id,
                            tags=json.loads(photo.tags or "[]"),
                            person_ref=photo.person_ref,
                            filename=photo.filename,
                            extension=photo.extension,
                            sha256=photo.sha256,
                            size=path.stat().st_size,
                            imported_at=photo.imported_at,
                            captured_at=photo.captured_at or photo.imported_at,
                            date_source=photo.date_source,
                            trip_id=photo.trip_id,
                            latitude=photo.latitude,
                            longitude=photo.longitude,
                        )
                    )
                trips = [
                    ArchivedTrip(
                        id=t.id,
                        title=t.title,
                        start_date=t.start_date,
                        end_date=t.end_date,
                        cover_photo_id=t.cover_photo_id
                        if any(p.id == t.cover_photo_id for p in photos)
                        else None,
                    )
                    for t in session.scalars(select(Trip))
                ]
            archive = Archive(
                photos=photos, trips=trips, person_names=self.library.catalog.person_names()
            )
            destination = destination_parent / (
                "thing sorted backup-"
                + datetime.now(UTC).strftime("%Y%m%d-%H%M%S-")
                + uuid.uuid4().hex[:6]
            )
            check_space(destination_parent, sum(p.size for p in photos))
            destination.mkdir()
            (destination / "originals").mkdir()
            return self._start("backup", source, destination, archive)

    def restore(self, source: str, parent: str) -> dict:
        with self.library.lock:
            self._idle()
            self._empty()
            source_path = safe_local(Path(source))
            archive = read_archive(source_path)
            destination_parent = safe_local(Path(parent))
            if (
                destination_parent == source_path
                or destination_parent.is_relative_to(source_path)
                or destination_parent.is_relative_to(self.library.root.parent)
            ):
                raise StorageError("Choose a separate location for restored originals.")
            check_space(destination_parent, sum(p.size for p in archive.photos))
            check_space(self.library.root, len(archive.photos) * 2 * 1024 * 1024)
            destination = destination_parent / ("thing sorted restored-" + uuid.uuid4().hex[:8])
            destination.mkdir()
            (destination / "originals").mkdir()
            return self._start("restore", source_path, destination, archive)

    def _empty(self) -> None:
        with self.library.db.session() as session:
            if session.scalar(select(func.count()).select_from(Photo)) or session.scalar(
                select(func.count()).select_from(Trip)
            ):
                raise StorageError(
                    "Restore requires an empty collection. Your current collection was kept."
                )

    def _start(self, kind: str, source: Path, destination: Path, archive: Archive) -> dict:
        if len(archive.model_dump_json().encode("utf-8")) > 32 * 1024 * 1024:
            raise StorageError("This backup catalog exceeds the supported size.")
        self.job = {
            "id": uuid.uuid4().hex,
            "state": "running",
            "kind": kind,
            "source": str(source),
            "destination": str(destination),
            "plan": archive.model_dump(),
            "done": 0,
            "total": len(archive.photos),
            "message": "",
        }
        self._save()
        self._launch()
        return self.status()

    def resume(self) -> dict:
        with self.library.lock:
            self._idle()
            if not self.job or self.job["state"] not in ("cancelled", "interrupted", "failed"):
                raise StorageError("There is no unfinished backup or restore.")
            if self.job["kind"] == "restore":
                with self.library.db.session() as session:
                    completed = session.get(Setting, "last_restore")
                    if completed and completed.value == self.job["id"]:
                        self.job["state"] = "complete"
                        self._save()
                        return self.status()
                self._empty()
            self.job.update(state="running", message="")
            self._save()
            self._launch()
            return self.status()

    def cancel(self) -> dict:
        self.cancel_event.set()
        return self.status()

    def _launch(self) -> None:
        self.cancel_event.clear()
        self.thread = threading.Thread(target=self._run, name="archive-worker", daemon=True)
        self.thread.start()

    def _checkpoint(self) -> None:
        if self.cancel_event.is_set() or self.library.stop.is_set():
            raise InterruptedError()

    def _copy(self, source: Path, destination: Path, photo: ArchivedPhoto) -> None:
        safe_local(source)
        safe_local(destination, exists=False)
        if source.stat().st_size != photo.size:
            raise StorageError("A backup file changed size or is missing.")
        if destination.exists():
            with destination.open("rb") as stream:
                if hashlib.file_digest(stream, "sha256").hexdigest() == photo.sha256:
                    return
            raise StorageError("A restored copy changed. Choose a new destination to retry.")
        temporary = owned(destination.parent, destination.name + ".partial")
        digest = hashlib.sha256()
        with source.open("rb") as reader, temporary.open("wb") as writer:
            while chunk := reader.read(1024 * 1024):
                self._checkpoint()
                digest.update(chunk)
                writer.write(chunk)
            writer.flush()
            os.fsync(writer.fileno())
        if digest.hexdigest() != photo.sha256:
            raise StorageError("A backup photo failed its integrity check.")
        temporary.replace(destination)

    def _run(self) -> None:
        from app.metadata import difference_hash

        try:
            job = self.job
            archive = Archive.model_validate(job["plan"])
            archive.validate_links()
            source, destination = (
                safe_local(Path(job["source"])),
                safe_local(Path(job["destination"])),
            )
            restored = []
            for index, photo in enumerate(archive.photos):
                self._checkpoint()
                name = photo.id + photo.extension
                target = owned(destination / "originals", name)
                self._copy(owned(source / "originals", name), target, photo)
                if job["kind"] == "restore":
                    decoded = decode(target, photo.extension)
                    with closing(decoded.image):
                        save_preview(
                            decoded.image, owned(self.library.thumbs, photo.id + ".jpg"), 480
                        )
                        save_preview(
                            decoded.image, owned(self.library.previews, photo.id + ".jpg"), 1600
                        )
                        data = photo.model_dump(exclude={"size"})
                        data["tags"] = json.dumps(photo.tags)
                        data.update(
                            width=decoded.width,
                            height=decoded.height,
                            mime_type=decoded.mime,
                            metadata_version=1,
                            visual_hash=difference_hash(decoded.image),
                        )
                        restored.append(data)
                job["done"] = index + 1
                self._save()
            self._checkpoint()
            if job["kind"] == "backup":
                atomic_json(owned(destination, "manifest.json"), archive.model_dump())
            else:
                with self.library.lock:
                    self._empty()
                    keep_gps = self.library.catalog.privacy()["storeGps"]
                    with self.library.db.session.begin() as session:
                        for data in restored:
                            if not keep_gps:
                                data["latitude"] = data["longitude"] = None
                            session.add(Photo(**data))
                        for trip in archive.trips:
                            session.add(Trip(**trip.model_dump()))
                        session.merge(
                            Setting(key="person_names", value=json.dumps(archive.person_names))
                        )
                        session.merge(Setting(key="library_root", value=str(destination)))
                        session.merge(Setting(key="last_restore", value=job["id"]))
            job.update(state="complete", message="")
        except InterruptedError:
            self.job.update(
                state="interrupted" if self.library.stop.is_set() else "cancelled",
                message="Partial copies are kept for Resume. Source files are unchanged.",
            )
        except (OSError, ValueError, RuntimeError, KeyError, SQLAlchemyError) as error:
            self.job.update(
                state="failed",
                message=str(error)
                if isinstance(error, StorageError)
                else "The archive operation stopped. Check the drive and free space, then resume.",
            )
        finally:
            try:
                self._save()
            except OSError:
                self.job.update(
                    state="failed",
                    message="Progress could not be saved. Check your app-data drive.",
                )
