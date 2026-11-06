"""Durable import jobs and a single background image worker."""

import hashlib
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.album_saver import AlbumSaver
from app.archives import ArchiveTasks
from app.catalog import Catalog
from app.database import Database, Item, Job, Photo, Setting
from app.decoders import EXTENSIONS, decode, save_preview
from app.duplicates import Duplicates
from app.metadata import difference_hash, extract
from app.organizer import Organizer
from app.storage import (
    MAX_BATCH,
    MAX_FILE,
    StorageError,
    check_space,
    copy_original,
    display_name,
    owned,
    safe_local,
)

ACTIVE = {"pending", "receiving", "queued", "working"}


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


class Library:
    def __init__(self, root: Path) -> None:
        safe_local(root, exists=False).mkdir(parents=True, exist_ok=True)
        self.root = safe_local(root)
        self.staging = self.root / "staging"
        self.thumbs = self.root / "thumbnails"
        self.previews = self.root / "previews"
        for folder in (self.staging, self.thumbs, self.previews):
            safe_local(folder, exists=False).mkdir(exist_ok=True)
        self.db = Database(self.root)
        self.catalog = Catalog(self)
        self.wake = threading.Event()
        self.stop = threading.Event()
        self.lock = threading.RLock()
        self.display_lock = threading.Lock()
        self.thread: threading.Thread | None = None
        self.tasks = ArchiveTasks(self)
        self.organizer = Organizer(self)
        self.duplicates = Duplicates(self)
        self.saver = AlbumSaver(self)

    def start(self) -> None:
        self.organizer.recover_pending()
        self.saver.recover()
        self.duplicates.recover()
        with self.db.session.begin() as session:
            for item in session.scalars(select(Item).where(Item.state.in_(ACTIVE))):
                if (
                    item.state in ("working", "queued", "receiving")
                    and owned(self.staging, item.id + ".stage").is_file()
                ):
                    item.state = "queued"
                else:
                    item.state, item.reason = (
                        "rejected",
                        "Copy interrupted. Select this file again to retry.",
                    )
                    self.cleanup(item.id)
        with self.db.session() as session:
            for item in session.scalars(
                select(Item).where(Item.state.in_({"added", "duplicate", "cancelled"}))
            ):
                self.cleanup(item.id)
        self.thread = threading.Thread(target=self.run, name="photo-import", daemon=True)
        self.thread.start()
        self.wake.set()

    def close(self) -> None:
        self.stop.set()
        self.wake.set()
        if self.thread:
            self.thread.join(timeout=4)
        if self.catalog.scan_thread:
            self.catalog.scan_thread.join(timeout=4)
        if self.tasks.thread:
            self.tasks.thread.join(timeout=4)
        if (
            (not self.thread or not self.thread.is_alive())
            and (not self.catalog.scan_thread or not self.catalog.scan_thread.is_alive())
            and (not self.tasks.thread or not self.tasks.thread.is_alive())
        ):
            self.db.close()

    def library_root(self) -> Path | None:
        with self.db.session() as session:
            setting = session.get(Setting, "library_root")
            return safe_local(Path(setting.value)) if setting else None

    def configure(self, selected: str) -> dict:
        parent = safe_local(Path(selected))
        if not parent.is_dir() or parent == self.root or parent.is_relative_to(self.root):
            raise StorageError("Choose a separate folder for your copied originals.")
        target = parent / "thing sorted library"
        safe_local(target, exists=False)
        with self.lock, self.db.session.begin() as session:
            current = session.get(Setting, "library_root")
            if current:
                return {"configured": True}
            if target.exists() and any(target.iterdir()):
                raise StorageError(
                    "This folder already contains a library. Choose an empty location."
                )
            check_space(parent, 0)
            target.mkdir(exist_ok=True)
            originals = target / "originals"
            originals.mkdir(exist_ok=True)
            session.add(Setting(key="library_root", value=str(target)))
        return {"configured": True}

    def summary(self) -> dict:
        with self.db.session() as session:
            return {
                "configured": session.get(Setting, "library_root") is not None,
                "total": session.scalar(select(func.count()).select_from(Photo)) or 0,
            }

    def create_job(self, files: list[dict]) -> dict:
        root = self.library_root()
        if root is None:
            raise StorageError("Choose your library folder first.")
        if sum(item["size"] for item in files) > MAX_BATCH:
            raise StorageError("Choose up to 2 GB of photos per import.")
        check_space(self.root, sum(min(item["size"], MAX_FILE) for item in files))
        job_id = uuid.uuid4().hex
        with self.lock, self.db.session.begin() as session:
            if self.tasks.busy():
                raise StorageError("Wait for the backup or restore to finish.")
            if session.scalar(select(Item.id).where(Item.state.in_(ACTIVE)).limit(1)):
                raise StorageError("Let the current import finish or cancel it first.")
            session.add(Job(id=job_id, created_at=datetime.now(UTC).isoformat(), cancelled=False))
            for ordinal, file in enumerate(files):
                name = display_name(file["name"])
                suffix = Path(name).suffix.lower()
                reason = ""
                if suffix not in EXTENSIONS:
                    reason = "This file format is not supported."
                elif file["size"] == 0:
                    reason = "This file is empty or could not be opened."
                elif file["size"] > MAX_FILE:
                    reason = "This file exceeds the 256 MB size limit."
                session.add(
                    Item(
                        id=uuid.uuid4().hex,
                        job_id=job_id,
                        filename=name,
                        size=file["size"],
                        ordinal=ordinal,
                        modified_ms=file.get("modified_ms"),
                        state="rejected" if reason else "pending",
                        reason=reason,
                    )
                )
        return self.job(job_id)

    def job(self, identifier: str) -> dict:
        with self.db.session() as session:
            job = session.get(Job, identifier)
            if not job:
                raise StorageError("This import could not be found.")
            items = list(
                session.scalars(
                    select(Item).where(Item.job_id == identifier).order_by(Item.ordinal)
                )
            )
            return {
                "id": job.id,
                "cancelled": job.cancelled,
                "active": any(item.state in ACTIVE for item in items),
                "items": [
                    {
                        "id": item.id,
                        "name": item.filename,
                        "size": item.size,
                        "state": item.state,
                        "reason": item.reason,
                        "photoId": item.photo_id,
                        "retryable": item.state == "rejected"
                        and owned(self.staging, item.id + ".stage").is_file(),
                    }
                    for item in items
                ],
            }

    def latest(self) -> dict | None:
        with self.db.session() as session:
            identifier = session.scalar(select(Job.id).order_by(Job.created_at.desc()).limit(1))
        return self.job(identifier) if identifier else None

    def reject(self, identifier: str, reason: str) -> None:
        with self.lock, self.db.session.begin() as session:
            item = session.get(Item, identifier)
            if item and item.state in ACTIVE:
                item.state, item.reason = (
                    ("cancelled" if session.get(Job, item.job_id).cancelled else "rejected"),
                    reason,
                )

    def cancel(self, identifier: str) -> dict:
        with self.lock, self.db.session.begin() as session:
            job = session.get(Job, identifier)
            if not job:
                raise StorageError("This import could not be found.")
            job.cancelled = True
            for item in session.scalars(select(Item).where(Item.job_id == identifier)):
                if item.state in {"pending", "queued"}:
                    item.state, item.reason = (
                        "cancelled",
                        "Cancelled. Your source file was not changed.",
                    )
                    self.cleanup(item.id)
        return self.job(identifier)

    def retry(self, identifier: str) -> dict:
        with self.lock, self.db.session.begin() as session:
            job = session.get(Job, identifier)
            if not job:
                raise StorageError("This import could not be found.")
            if self.tasks.busy():
                raise StorageError("Wait for the backup or restore to finish.")
            if session.scalar(select(Item.id).where(Item.state.in_(ACTIVE)).limit(1)):
                raise StorageError("Wait for the current import to finish.")
            job.cancelled = False
            for item in session.scalars(
                select(Item).where(Item.job_id == identifier, Item.state == "rejected")
            ):
                if owned(self.staging, item.id + ".stage").exists():
                    item.state, item.reason = "queued", ""
        self.wake.set()
        return self.job(identifier)

    def cleanup(self, identifier: str) -> None:
        for suffix in (".part", ".stage"):
            try:
                owned(self.staging, identifier + suffix).unlink(missing_ok=True)
            except OSError:
                # Windows may briefly lock a staging file. It remains private app scratch data.
                continue

    def photos(self, page: int) -> dict:
        with self.db.session() as session:
            photos = session.scalars(
                select(Photo)
                .order_by(Photo.imported_at.desc(), Photo.id)
                .offset(page * 48)
                .limit(48)
            )
            return {
                "total": session.scalar(select(func.count()).select_from(Photo)) or 0,
                "photos": [
                    {
                        "id": p.id,
                        "name": p.filename,
                        "width": p.width,
                        "height": p.height,
                        "format": p.extension[1:].upper(),
                    }
                    for p in photos
                ],
            }

    def display_path(self, identifier: str) -> Path:
        # Regenerate lazily for existing libraries; originals and AI previews are unchanged.
        with self.display_lock:
            with self.db.session() as session:
                photo = session.get(Photo, identifier)
                if photo is None:
                    raise StorageError("This photo could not be found.")
                suffix = photo.extension
            target = owned(self.previews, identifier + "-display-v1.jpg")
            if target.is_file():
                return target
            original = self.organizer.original(identifier)
            decoded = decode(original, suffix, full_resolution=True)
            try:
                save_preview(decoded.image, target, 4096, quality=95)
            finally:
                decoded.image.close()
            return target

    def image_path(self, identifier: str, preview: bool = False) -> Path:
        with self.db.session() as session:
            if session.get(Photo, identifier) is None:
                raise StorageError("This photo could not be found.")
        path = owned(self.previews if preview else self.thumbs, identifier + ".jpg")
        if not path.is_file():
            raise StorageError("This preview is not available.")
        return path

    def run(self) -> None:
        self.organizer.ensure_folders()
        try:
            self.catalog.index_existing()
        except (OSError, StorageError, SQLAlchemyError):
            pass  # Import remains available if a prior library drive is temporarily offline.
        while not self.stop.is_set():
            self.wake.wait(timeout=1)
            self.wake.clear()
            while not self.stop.is_set():
                try:
                    with self.db.session() as session:
                        identifier = session.scalar(
                            select(Item.id).where(Item.state == "queued").limit(1)
                        )
                    if not identifier:
                        break
                    self.process(identifier)
                except SQLAlchemyError:
                    # Retain the durable queue when a disk/database operation temporarily fails.
                    self.stop.wait(1)
                    break

    def process(self, identifier: str) -> None:
        with self.lock, self.db.session.begin() as session:
            item = session.get(Item, identifier)
            if not item or item.state != "queued":
                return
            item.state = "working"
            filename, job_id, modified_ms = item.filename, item.job_id, item.modified_ms
        suffix = Path(filename).suffix.lower()
        source = owned(self.staging, identifier + ".stage")
        destination: Path | None = None
        committed = False
        decoded_ok = False
        try:
            decoded = decode(source, suffix)
            decoded_ok = True
            try:
                imported_at = datetime.now(UTC).isoformat()
                metadata = extract(
                    source, modified_ms, imported_at, self.catalog.privacy()["storeGps"]
                )
                visual_hash = difference_hash(decoded.image)
                sha = digest(source)
                with self.db.session() as session:
                    duplicate = session.scalar(select(Photo).where(Photo.sha256 == sha))
                if duplicate:
                    with self.lock, self.db.session.begin() as session:
                        item = session.get(Item, identifier)
                        item.state, item.photo_id, item.reason = (
                            "duplicate",
                            duplicate.id,
                            "An identical photo is already in your library.",
                        )
                    self.cleanup(identifier)
                    return
                if self.stop.is_set():
                    return  # Leave the durable staging file for the next startup.
                root = self.library_root()
                if root is None:
                    raise StorageError("Your library folder is not available.")
                originals = safe_local(root / "originals")
                check_space(originals, source.stat().st_size)
                check_space(self.root, 8 * 1024 * 1024)
                destination = owned(originals, identifier + suffix)
                copy_original(source, destination)
                if digest(destination) != sha:
                    raise StorageError("The stored copy could not be verified. Please retry.")
                save_preview(decoded.image, owned(self.thumbs, identifier + ".jpg"), 480)
                save_preview(decoded.image, owned(self.previews, identifier + ".jpg"), 1600)
                with self.lock, self.db.session.begin() as session:
                    item = session.get(Item, identifier)
                    job = session.get(Job, job_id)
                    if job.cancelled:
                        item.state, item.reason = (
                            "cancelled",
                            "Cancelled. Your source file was not changed.",
                        )
                    else:
                        if not self.catalog.privacy()["storeGps"]:
                            metadata["latitude"] = metadata["longitude"] = None
                        session.add(
                            Photo(
                                id=identifier,
                                filename=filename,
                                extension=suffix,
                                sha256=sha,
                                mime_type=decoded.mime,
                                width=decoded.width,
                                height=decoded.height,
                                imported_at=imported_at,
                                visual_hash=visual_hash,
                                **metadata,
                            )
                        )
                        item.state, item.photo_id, item.reason = "added", identifier, ""
                        session.flush()
                committed = not job.cancelled
                self.cleanup(identifier)
            finally:
                decoded.image.close()
        except IntegrityError:
            with self.lock, self.db.session.begin() as session:
                item = session.get(Item, identifier)
                item.state, item.reason = (
                    "duplicate",
                    "An identical photo is already in your library.",
                )
            self.cleanup(identifier)
        except StorageError as exc:
            self.reject(identifier, str(exc))
            if not decoded_ok:
                self.cleanup(identifier)
        except (OSError, MemoryError, SQLAlchemyError):
            self.reject(
                identifier,
                "Could not save this photo. Check free space and the library drive, "
                "then retry queued files.",
            )
        finally:
            if not committed and destination is not None:
                # Only generated files owned by this unfinished import may be removed.
                for path in (
                    destination,
                    destination.with_suffix(destination.suffix + ".copying"),
                    owned(self.thumbs, identifier + ".jpg"),
                    owned(self.previews, identifier + ".jpg"),
                ):
                    try:
                        path.unlink(missing_ok=True)
                    except OSError:
                        continue
