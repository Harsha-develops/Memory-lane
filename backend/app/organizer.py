"""Recoverable moves of owned imported copies; never touch external source files."""

import json
import re
from pathlib import Path
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.database import Photo, Setting
from app.storage import RESERVED, StorageError, safe_local

if TYPE_CHECKING:
    from app.library import Library


def relative_item(root: Path, relative: str, *, create: bool = False) -> Path:
    parts = relative.split("/")
    if not (
        (len(parts) == 2 and parts[0] == "originals")
        or (len(parts) == 3 and parts[0] == "Organized")
    ) or any(not p or p in (".", "..") for p in parts):
        raise StorageError("Invalid organized photo path.")
    root = safe_local(root)
    path = safe_local(root.joinpath(*parts), exists=False)
    if not path.is_relative_to(root):
        raise StorageError("Invalid organized photo path.")
    if create:
        path.parent.mkdir(parents=True, exist_ok=True)
        safe_local(path.parent)
    return path


def clean_name(value: str, limit: int) -> str:
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value).strip(" .")[:limit].rstrip(" .")
    if not value or RESERVED.match(value):
        value = "Photo_" + value
    return value


class Organizer:
    def __init__(self, library: "Library") -> None:
        self.library = library

    def root_for(self, identifier: str) -> Path:
        with self.library.db.session() as session:
            assigned = session.get(Setting, "photo_root:" + identifier)
            root = safe_local(Path(assigned.value)) if assigned else self.library.library_root()
        if root is None:
            raise StorageError("Reconnect your imported-photo library.")
        return root

    def roots(self) -> list[Path]:
        with self.library.db.session() as session:
            values = list(
                session.scalars(select(Setting.value).where(Setting.key.startswith("photo_root:")))
            )
            main = session.get(Setting, "library_root")
            if main:
                values.append(main.value)
        return [safe_local(Path(v), exists=False) for v in set(values)]

    def recover_pending(self) -> None:
        with self.library.db.session() as session:
            identifiers = list(session.scalars(select(Photo.id).where(Photo.pending_path != "")))
        for identifier in identifiers:
            try:
                self.original(identifier)
            except (OSError, StorageError):
                # Keep the journal intact if a drive is offline or files need attention.
                continue

    def ensure_folder(self, identifier: str) -> dict:
        try:
            with self.library.db.session() as session:
                photo = session.get(Photo, identifier)
                if session.get(Setting, "pending_delete:" + identifier):
                    return {}
                if not photo or not photo.categorized_at:
                    return {}
                tags = json.loads(photo.tags or "[]")
                names = self.library.catalog.person_names()
                people = sorted(t for t in tags if t.startswith("person ") and t in names)
                label = (
                    (photo.organized_label if photo.organized_label in people else people[0])
                    if people
                    else photo.organized_label or (tags[0] if tags else "others")
                )
            if people and tags != people:
                with self.library.db.session.begin() as session:
                    session.get(Photo, identifier).tags = json.dumps(people)
            result = self.move(identifier, label)
            return {"organizedLabel": result["label"]}
        except (OSError, StorageError) as error:
            return {"organizationError": str(error)}

    def ensure_folders(self) -> None:
        names = {**self.library.catalog.category_names(), **self.library.catalog.person_names()}
        with self.library.db.session() as session:
            rows = list(
                session.execute(
                    select(Photo.id, Photo.organized_label, Photo.storage_path, Photo.tags).where(
                        Photo.categorized_at != ""
                    )
                )
            )
        for identifier, label, path, raw_tags in rows:
            if self.library.stop.is_set():
                break
            expected = "Organized/" + clean_name(names.get(label, label.title()), 60) + "/"
            tags = json.loads(raw_tags or "[]")
            people = [t for t in tags if t.startswith("person ") and t in names]
            if (
                label
                and path.startswith(expected)
                and (not people or (label in people and tags == sorted(people)))
            ):
                continue
            self.ensure_folder(identifier)

    def original(self, identifier: str) -> Path:
        with self.library.lock:
            root = self.root_for(identifier)
            if root is None:
                raise StorageError("Reconnect your imported-photo library.")
            with self.library.db.session.begin() as session:
                photo = session.get(Photo, identifier)
                if not photo:
                    raise StorageError("This photo could not be found.")
                current = relative_item(
                    root, photo.storage_path or f"originals/{photo.id}{photo.extension}"
                )
                if photo.pending_path:
                    target = relative_item(root, photo.pending_path)
                    if target.is_file() and not current.exists():
                        photo.storage_path = photo.pending_path
                        photo.organized_label = photo.pending_label
                        current = target
                    elif not current.is_file() or target.exists():
                        raise StorageError(
                            "An interrupted move needs attention. Both files have been preserved."
                        )
                    photo.pending_path = ""
                    photo.pending_label = ""
                return current

    def move(self, identifier: str, label: str) -> dict:
        with self.library.lock:
            if self.library.tasks.status().get("state") in ("running", "paused"):
                raise StorageError("Finish the current backup or restore before organizing files.")
            source = self.original(identifier)
            root = self.root_for(identifier)
            with self.library.db.session() as session:
                photo = session.get(Photo, identifier)
                if session.get(Setting, "pending_delete:" + identifier):
                    raise StorageError("Restart Memory Lane to finish the pending deletion first.")
                if session.get(Setting, "relocation:" + identifier):
                    raise StorageError("Restart Memory Lane to finish the interrupted save first.")
                tags = json.loads(photo.tags or "[]")
                people = [
                    t
                    for t in tags
                    if t.startswith("person ") and t in self.library.catalog.person_names()
                ]
                if people and label not in people:
                    raise StorageError(
                        "This photo matches a named person. Choose one of its name folders."
                    )
                if not photo.categorized_at or label not in (tags or ["others", "uncategorized"]):
                    raise StorageError("Choose one of this photo's matching categories.")
                title = {
                    **self.library.catalog.category_names(),
                    **self.library.catalog.person_names(),
                }.get(label, label.title())
                filename = (
                    clean_name(Path(photo.filename).stem, 60) + "--" + photo.id + photo.extension
                )
                relative = "Organized/" + clean_name(title, 60) + "/" + filename
            target = relative_item(root, relative, create=True)
            if target == source:
                return {"label": label, "folder": str(target.parent), "moved": False}
            if not source.is_file():
                raise StorageError("Reconnect the drive containing this imported photo.")
            if target.exists():
                raise StorageError(
                    "A file already exists at the destination. Nothing was overwritten."
                )
            with self.library.db.session.begin() as session:
                photo = session.get(Photo, identifier)
                photo.pending_path, photo.pending_label = relative, label
            # On Windows rename refuses to overwrite. The durable journal recovers either side
            # of a crash; no copy/delete sequence can leave duplicate library files behind.
            source.rename(target)
            self.original(identifier)
            return {"label": label, "folder": str(target.parent), "moved": True}
