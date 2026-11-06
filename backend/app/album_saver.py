"""User-chosen album destinations with verified, recoverable managed-copy relocation."""

import hashlib
import json
import os
import shutil
import uuid
from pathlib import Path
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.database import Photo, Setting
from app.organizer import relative_item
from app.storage import StorageError, check_space, safe_local

if TYPE_CHECKING:
    from app.library import Library


def digest(path: Path) -> str:
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


class AlbumSaver:
    def __init__(self, library: "Library") -> None:
        self.library = library

    def prepare(self, ids: list[str], parent: str) -> dict:
        with self.library.lock:
            if self.library.tasks.busy():
                raise StorageError("Finish the backup or restore first.")
            ids = list(dict.fromkeys(ids))
            if not ids or len(ids) > 200:
                raise StorageError("Choose 1–200 imported photos.")
            with self.library.db.session() as session:
                for identifier in ids:
                    photo = session.get(Photo, identifier)
                    if not photo or not photo.categorized_at:
                        raise StorageError("Finish categorising every photo in this album first.")
                if session.scalar(select(Setting.key).where(Setting.key.startswith("relocation:"))):
                    raise StorageError("Restart Memory Lane to finish the interrupted save first.")
            selected = safe_local(Path(parent))
            if not selected.is_dir() or selected.is_relative_to(self.library.root.parent):
                raise StorageError("Choose a folder outside the app profile.")
            for root in self.library.organizer.roots():
                if selected.is_relative_to(root):
                    raise StorageError("Choose a folder outside an existing managed photo library.")
            batch = uuid.uuid4().hex
            destination = safe_local(selected / ("Memory Lane Album-" + batch[:8]), exists=False)
            destination.mkdir()
            with self.library.db.session.begin() as session:
                session.add(
                    Setting(
                        key="save_batch:" + batch,
                        value=json.dumps({"root": str(destination), "ids": ids}),
                    )
                )
            return {"batch": batch, "folder": str(destination)}

    def move(self, identifier: str, batch: str) -> dict:
        with self.library.display_lock, self.library.lock:
            if self.library.tasks.busy():
                raise StorageError("Finish the backup or restore first.")
            with self.library.db.session() as session:
                item = session.get(Setting, "save_batch:" + batch)
                if not item:
                    raise StorageError("Choose a save destination first.")
                plan = json.loads(item.value)
                if identifier not in plan["ids"]:
                    raise StorageError("This photo is not in the chosen album.")
                if session.get(Setting, "pending_delete:" + identifier):
                    raise StorageError("Finish the pending deletion before saving this album.")
                pending = session.get(Setting, "relocation:" + identifier)
            if pending:
                self.finish(identifier)
            result = self.library.organizer.ensure_folder(identifier)
            if result.get("organizationError"):
                raise StorageError(result["organizationError"])
            source_root = self.library.organizer.root_for(identifier)
            with self.library.db.session() as session:
                photo = session.get(Photo, identifier)
                if not photo or not photo.categorized_at or not photo.storage_path:
                    raise StorageError("Categorise this photo before saving it.")
                record = {
                    "batch": batch,
                    "sourceRoot": str(source_root),
                    "targetRoot": plan["root"],
                    "path": photo.storage_path,
                    "sha256": photo.sha256,
                }
            if source_root == safe_local(Path(plan["root"])):
                return {"ok": True}
            with self.library.db.session.begin() as session:
                session.merge(Setting(key="relocation:" + identifier, value=json.dumps(record)))
            self.finish(identifier)
            return {"ok": True}

    def finish(self, identifier: str) -> None:
        with self.library.db.session() as session:
            item = session.get(Setting, "relocation:" + identifier)
            if item is None:
                return
            record = json.loads(item.value)
            batch = session.get(Setting, "save_batch:" + record["batch"])
            photo = session.get(Photo, identifier)
            if not batch or not photo:
                raise StorageError("The saved album record is unavailable.")
            plan = json.loads(batch.value)
            if (
                identifier not in plan["ids"]
                or record["targetRoot"] != plan["root"]
                or photo.storage_path != record["path"]
                or photo.sha256 != record["sha256"]
                or str(self.library.organizer.root_for(identifier)) != record["sourceRoot"]
            ):
                raise StorageError("The saved album record does not match this managed photo.")
        source = relative_item(safe_local(Path(record["sourceRoot"])), record["path"])
        target = relative_item(safe_local(Path(record["targetRoot"])), record["path"], create=True)
        if not target.exists():
            if not source.is_file() or digest(source) != record["sha256"]:
                raise StorageError(
                    "The imported copy is missing or has changed. Nothing was deleted."
                )
            check_space(target.parent, source.stat().st_size)
            temporary = safe_local(target.with_suffix(target.suffix + ".copying"), exists=False)
            temporary.unlink(missing_ok=True)  # Only this journal's generated partial copy.
            with source.open("rb") as src, temporary.open("xb") as dst:
                shutil.copyfileobj(src, dst, 1024 * 1024)
                dst.flush()
                os.fsync(dst.fileno())
            if digest(temporary) != record["sha256"]:
                raise StorageError("Copy verification failed. The imported original was preserved.")
            temporary.rename(target)  # Refuses to overwrite on Windows.
        if digest(target) != record["sha256"]:
            raise StorageError(
                "A different file exists at the destination. Both files were preserved."
            )
        if source.exists():
            if digest(source) != record["sha256"]:
                raise StorageError(
                    "The imported copy changed during saving. Both files were preserved."
                )
            source.unlink()
        with self.library.db.session.begin() as session:
            session.merge(Setting(key="photo_root:" + identifier, value=record["targetRoot"]))
            session.delete(session.get(Setting, "relocation:" + identifier))

    def recover(self) -> None:
        with self.library.display_lock, self.library.lock:
            with self.library.db.session() as session:
                keys = list(
                    session.scalars(
                        select(Setting.key).where(Setting.key.startswith("relocation:"))
                    )
                )
            for key in keys:
                try:
                    self.finish(key.split(":", 1)[1])
                except (OSError, StorageError):
                    continue  # Keep intent and copies intact while a drive is disconnected.
