"""Explicit, journalled deletion of managed lookalike copies only."""

import json
import math
from typing import TYPE_CHECKING

from PIL import Image, ImageFilter, ImageStat
from sqlalchemy import delete, or_, select, update

from app.database import Item, Photo, Setting, SimilarPair, Trip
from app.organizer import relative_item
from app.storage import StorageError, owned

if TYPE_CHECKING:
    from app.library import Library


class Duplicates:
    def __init__(self, library: "Library") -> None:
        self.library = library

    def score(self, photo: Photo) -> float:
        # Same-size, lightly denoised previews reduce resolution/noise bias in edge estimates.
        with Image.open(owned(self.library.previews, photo.id + ".jpg")) as image:
            gray = image.convert("L").resize((256, 256)).filter(ImageFilter.GaussianBlur(0.6))
            edges = gray.filter(ImageFilter.FIND_EDGES).crop((2, 2, 254, 254))
            sharpness = ImageStat.Stat(edges).var[0]
        return math.log2(max(1, photo.width * photo.height)) + 0.5 * math.log2(1 + sharpness)

    def remove_lower_quality(self, pair_id: str) -> dict:
        with self.library.display_lock, self.library.lock:
            if self.library.tasks.busy() or self.library.catalog.scan_state == "running":
                raise StorageError("Wait for the scan, backup or restore to finish.")
            with self.library.db.session() as session:
                if session.scalar(
                    select(Setting.key).where(Setting.key.startswith("pending_delete:"))
                ):
                    raise StorageError("Finish the pending deletion before reviewing another pair.")
                if session.scalar(select(Setting.key).where(Setting.key.startswith("relocation:"))):
                    raise StorageError(
                        "Restart Memory Lane to finish the interrupted album save first."
                    )
                pair = session.get(SimilarPair, pair_id)
                if not pair or pair.decision != "pending":
                    raise StorageError("This suggestion has already been reviewed.")
                first, second = (
                    session.get(Photo, pair.first_id),
                    session.get(Photo, pair.second_id),
                )
                if not first or not second or first.id == second.id:
                    raise StorageError("Both photos must be available before deleting a copy.")
                # Resolve both managed originals before making a destructive decision.
                for photo in (first, second):
                    if not self.library.organizer.original(photo.id).is_file():
                        raise StorageError("Reconnect both imported copies before reviewing them.")
                a, b = self.score(first), self.score(second)
                # Within half a score unit, estimated quality is similar; prefer a stable ID.
                keep, remove = (first, second) if a > b else (second, first)
                if abs(a - b) <= 0.5:
                    keep, remove = sorted((first, second), key=lambda p: p.id)
                source = self.library.organizer.original(remove.id)
                root = self.library.organizer.root_for(remove.id)
                record = {"path": source.relative_to(root).as_posix(), "kept": keep.id}
                result = {"ok": True, "deletedName": remove.filename, "keptName": keep.filename}
            # Persist intent first. A crash after unlink is completed on next startup.
            with self.library.db.session.begin() as session:
                session.merge(Setting(key="pending_delete:" + remove.id, value=json.dumps(record)))
            self.finish(remove.id)
            return result

    def finish(self, identifier: str) -> None:
        with self.library.db.session() as session:
            journal = session.get(Setting, "pending_delete:" + identifier)
            if journal is None:
                return
            record = json.loads(journal.value)
            photo = session.get(Photo, identifier)
            root = self.library.organizer.root_for(identifier)
            if root is None:
                raise StorageError("Reconnect the imported-copy library to finish deletion.")
            path = relative_item(root, record["path"])
            # A journal cannot nominate an external file or another photo's managed copy.
            if not photo or path != self.library.organizer.original(identifier):
                raise StorageError("The deletion journal does not match this imported copy.")
            kept = session.get(Photo, record["kept"])
            if not kept or not self.library.organizer.original(kept.id).is_file():
                raise StorageError("The retained photo is unavailable. Deletion has stopped.")
        path.unlink(missing_ok=True)
        for parent, filename in (
            (self.library.thumbs, identifier + ".jpg"),
            (self.library.previews, identifier + ".jpg"),
            (self.library.previews, identifier + "-display-v1.jpg"),
        ):
            owned(parent, filename).unlink(missing_ok=True)
        with self.library.db.session.begin() as session:
            photo = session.get(Photo, identifier)
            kept = session.get(Photo, record["kept"])
            if photo.person_ref and not kept.person_ref:
                kept.person_ref = photo.person_ref
            session.execute(
                update(Trip).where(Trip.cover_photo_id == identifier).values(cover_photo_id=None)
            )
            session.execute(update(Item).where(Item.photo_id == identifier).values(photo_id=None))
            session.execute(
                delete(SimilarPair).where(
                    or_(SimilarPair.first_id == identifier, SimilarPair.second_id == identifier)
                )
            )
            assigned = session.get(Setting, "photo_root:" + identifier)
            if assigned:
                session.delete(assigned)
            session.delete(photo)
            session.delete(session.get(Setting, "pending_delete:" + identifier))

    def recover(self) -> None:
        with self.library.display_lock, self.library.lock:
            with self.library.db.session() as session:
                keys = list(
                    session.scalars(
                        select(Setting.key).where(Setting.key.startswith("pending_delete:"))
                    )
                )
            for key in keys:
                try:
                    self.finish(key.split(":", 1)[1])
                except (OSError, StorageError):
                    # Keep the durable intention when a drive or file is temporarily unavailable.
                    continue
