"""Collection queries and explicit organization; no original file mutation."""

import json
import re
import threading
import uuid
from collections import defaultdict
from typing import TYPE_CHECKING

from PIL import Image
from sqlalchemy import func, select, update
from sqlalchemy.exc import SQLAlchemyError

from app.database import Item, Photo, Setting, SimilarPair, Trip
from app.metadata import difference_hash, extract
from app.storage import StorageError, owned

if TYPE_CHECKING:
    from app.library import Library


def photo_dict(photo: Photo) -> dict:
    return {
        "tags": json.loads(photo.tags or "[]"),
        "personReference": photo.person_ref,
        "id": photo.id,
        "name": photo.filename,
        "width": photo.width,
        "height": photo.height,
        "format": photo.extension[1:].upper(),
        "tripId": photo.trip_id,
        "capturedAt": photo.captured_at or photo.imported_at,
        "dateSource": photo.date_source,
    }


class Catalog:
    def __init__(self, library: "Library") -> None:
        self.library = library
        self.scan_lock = threading.Lock()
        self.scan_state = "idle"
        self.scan_progress = 0
        self.scan_total = 0
        self.scan_thread: threading.Thread | None = None

    def privacy(self) -> dict:
        with self.library.db.session() as session:
            show = session.get(Setting, "show_gps")
            store = session.get(Setting, "store_gps")
            return {
                "showGps": bool(show and show.value == "true"),
                "storeGps": not store or store.value == "true",
            }

    def set_privacy(self, show: bool, store: bool) -> dict:
        with self.library.lock, self.library.db.session.begin() as session:
            for key, value in [("show_gps", show), ("store_gps", store)]:
                session.merge(Setting(key=key, value="true" if value else "false"))
        return self.privacy()

    def forget_locations(self) -> dict:
        with self.library.lock, self.library.db.session.begin() as session:
            session.execute(update(Photo).values(latitude=None, longitude=None))
            session.merge(Setting(key="store_gps", value="false"))
            session.merge(Setting(key="show_gps", value="false"))
        return self.privacy()

    def query(
        self,
        offset: int = 0,
        limit: int = 48,
        trip: str | None = None,
        start: str | None = None,
        end: str | None = None,
        search: str = "",
        tag: str = "",
    ) -> dict:
        conditions = []
        if trip == "unassigned":
            conditions.append(Photo.trip_id.is_(None))
        elif trip:
            conditions.append(Photo.trip_id == trip)
        if start:
            conditions.append(Photo.captured_at >= start)
        if end:
            conditions.append(Photo.captured_at < end + "T99")
        if tag:
            conditions.append(Photo.tags.contains(json.dumps(tag.lower()), autoescape=True))
        if search:
            conditions.append(Photo.filename.contains(search, autoescape=True))
        with self.library.db.session() as session:
            total = session.scalar(select(func.count()).select_from(Photo).where(*conditions)) or 0
            rows = session.scalars(
                select(Photo)
                .where(*conditions)
                .order_by(Photo.captured_at.desc(), Photo.id)
                .offset(offset)
                .limit(limit)
            )
            return {"total": total, "photos": [photo_dict(p) for p in rows]}

    def detail(self, identifier: str) -> dict:
        privacy = self.privacy()
        with self.library.db.session() as session:
            photo = session.get(Photo, identifier)
            if not photo:
                raise StorageError("This photo could not be found.")
            result = photo_dict(photo)
            result.update(
                {
                    "dateSource": photo.date_source,
                    "importedAt": photo.imported_at,
                    "latitude": photo.latitude if privacy["showGps"] else None,
                    "longitude": photo.longitude if privacy["showGps"] else None,
                    "locationHidden": not privacy["showGps"],
                }
            )
            return result

    def save_tags(self, identifier: str, tags: list[str]) -> dict:
        tags = sorted(set(t.strip().lower() for t in tags if t.strip()))
        if len(tags) > 64 or any(not re.fullmatch(r"[a-z0-9][a-z0-9 -]{0,39}", t) for t in tags):
            raise StorageError("Use up to 64 short English category labels.")
        with self.library.lock, self.library.db.session.begin() as session:
            photo = session.get(Photo, identifier)
            if not photo:
                raise StorageError("This photo could not be found.")
            photo.tags = json.dumps(tags)
        return {"ok": True}

    def auto_categories(self, identifier: str, tags: list[str], scope: list[str]) -> dict:
        if (
            len(scope) > 64
            or len(tags) > 64
            or any(not re.fullmatch(r"[a-z0-9][a-z0-9 -]{0,39}", t) for t in scope + tags)
            or not set(tags).issubset(scope)
        ):
            raise StorageError("Invalid AI category result.")
        with self.library.lock, self.library.db.session.begin() as session:
            photo = session.get(Photo, identifier)
            if not photo:
                raise StorageError("This photo could not be found.")
            previous = set(json.loads(photo.tags or "[]"))
            updated = sorted((previous - set(scope)) | set(tags))
            if len(updated) > 64:
                raise StorageError("Too many categories for this photo.")
            photo.tags = json.dumps(updated)
        return {"tags": updated}

    def person_names(self) -> dict[str, str]:
        with self.library.db.session() as session:
            item = session.get(Setting, "person_names")
            return json.loads(item.value) if item else {}

    def rename_person(self, label: str, name: str) -> dict:
        if (
            not re.fullmatch(r"person [1-9][0-9]{0,5}", label)
            or not name.strip()
            or len(name.strip()) > 80
        ):
            raise StorageError("Enter a name of up to 80 characters.")
        with self.library.lock, self.library.db.session.begin() as session:
            exists = session.scalar(select(Photo.id).where(Photo.person_ref == label))
            if not exists:
                raise StorageError("Create a person group before naming it.")
            value = session.get(Setting, "person_names")
            names = json.loads(value.value) if value else {}
            names[label] = name.strip()
            session.merge(Setting(key="person_names", value=json.dumps(names)))
        return {"ok": True}

    def albums(self) -> list[dict]:
        names = self.person_names()
        result = []
        with self.library.db.session() as session:
            for category in self.categories():
                label = category["label"]
                cover = session.scalar(
                    select(Photo.id)
                    .where(Photo.tags.contains(json.dumps(label), autoescape=True))
                    .order_by(Photo.captured_at.desc(), Photo.id)
                    .limit(1)
                )
                result.append(
                    {
                        "label": label,
                        "title": names.get(label, label.title()),
                        "count": category["count"],
                        "coverPhotoId": cover,
                    }
                )
        return result

    def categories(self) -> list[dict]:
        counts: dict[str, int] = defaultdict(int)
        with self.library.db.session() as session:
            for value, count in session.execute(
                select(Photo.tags, func.count(Photo.id)).group_by(Photo.tags)
            ):
                for tag in json.loads(value or "[]"):
                    counts[tag] += count
        return [{"label": tag, "count": count} for tag, count in sorted(counts.items())]

    def people(self) -> list[dict]:
        with self.library.db.session() as session:
            return [
                {"id": p.id, "label": p.person_ref}
                for p in session.scalars(
                    select(Photo).where(Photo.person_ref != "").order_by(Photo.person_ref)
                )
            ]

    def new_person(self, identifier: str) -> dict:
        with self.library.lock, self.library.db.session.begin() as session:
            photo = session.get(Photo, identifier)
            if not photo:
                raise StorageError("This photo could not be found.")
            if photo.person_ref:
                return {"label": photo.person_ref}
            references = list(
                session.scalars(select(Photo.person_ref).where(Photo.person_ref != ""))
            )
            if len(references) >= 8:
                raise StorageError("This version supports eight person reference groups.")
            labels = set(references)
            for value in session.scalars(select(Photo.tags)):
                labels.update(
                    t
                    for t in json.loads(value or "[]")
                    if re.fullmatch(r"person [1-9][0-9]{0,5}", t)
                )
            used = [int(label.split()[-1]) for label in labels]
            number = 1
            while number in used:
                number += 1
            label = f"person {number}"
            photo.person_ref = label
            tags = json.loads(photo.tags or "[]")
            if len(tags) >= 64 and label not in tags:
                raise StorageError("Remove one category before adding a person group.")
            photo.tags = json.dumps(sorted(set(tags + [label])))
        return {"label": label}

    def remove_person_reference(self, identifier: str) -> dict:
        with self.library.lock, self.library.db.session.begin() as session:
            photo = session.get(Photo, identifier)
            if not photo:
                raise StorageError("This photo could not be found.")
            photo.person_ref = ""
        return {"ok": True}

    def trips(self) -> list[dict]:
        with self.library.db.session() as session:
            counts = dict(
                session.execute(
                    select(Photo.trip_id, func.count(Photo.id)).group_by(Photo.trip_id)
                ).all()
            )
            result = []
            for trip in session.scalars(select(Trip).order_by(Trip.title)):
                cover = trip.cover_photo_id
                if not cover or not session.scalar(
                    select(Photo.id).where(Photo.id == cover, Photo.trip_id == trip.id)
                ):
                    cover = session.scalar(
                        select(Photo.id)
                        .where(Photo.trip_id == trip.id)
                        .order_by(Photo.captured_at)
                        .limit(1)
                    )
                result.append(
                    {
                        "id": trip.id,
                        "title": trip.title,
                        "kind": trip.kind,
                        "startDate": trip.start_date,
                        "endDate": trip.end_date,
                        "coverPhotoId": cover,
                        "count": counts.get(trip.id, 0),
                    }
                )
            return result

    def save_trip(
        self,
        title: str,
        start: str | None,
        end: str | None,
        identifier: str | None = None,
        kind: str | None = None,
    ) -> dict:
        if kind not in (None, "trip", "album"):
            raise StorageError("Choose Trip or Album.")
        title = title.strip()
        if not title:
            raise StorageError("Give the trip a name.")
        if start and end and start > end:
            raise StorageError("The end date must be on or after the start date.")
        editing = identifier is not None
        identifier = identifier or uuid.uuid4().hex
        with self.library.lock, self.library.db.session.begin() as session:
            trip = session.get(Trip, identifier)
            if editing and not trip:
                raise StorageError("This trip could not be found.")
            if trip:
                trip.kind = kind or trip.kind
                trip.title, trip.start_date, trip.end_date = title, start, end
            else:
                session.add(
                    Trip(
                        id=identifier,
                        title=title,
                        kind=kind or "trip",
                        start_date=start,
                        end_date=end,
                        cover_photo_id=None,
                    )
                )
        return next(t for t in self.trips() if t["id"] == identifier)

    def delete_trip(self, identifier: str) -> dict:
        with self.library.lock, self.library.db.session.begin() as session:
            trip = session.get(Trip, identifier)
            if not trip:
                raise StorageError("This trip could not be found.")
            session.execute(update(Photo).where(Photo.trip_id == identifier).values(trip_id=None))
            session.delete(trip)
        return {"ok": True}

    def move(self, identifiers: list[str], trip_id: str | None) -> dict:
        with self.library.lock, self.library.db.session.begin() as session:
            if trip_id and not session.get(Trip, trip_id):
                raise StorageError("This trip could not be found.")
            unique = set(identifiers)
            found = session.scalar(
                select(func.count()).select_from(Photo).where(Photo.id.in_(unique))
            )
            if found != len(unique):
                raise StorageError("One of the selected photos is no longer available.")
            session.execute(update(Photo).where(Photo.id.in_(unique)).values(trip_id=trip_id))
        return {"ok": True}

    def cover(self, trip_id: str, photo_id: str) -> dict:
        with self.library.lock, self.library.db.session.begin() as session:
            trip = session.get(Trip, trip_id)
            photo = session.get(Photo, photo_id)
            if not trip or not photo or photo.trip_id != trip_id:
                raise StorageError("Choose a photo already assigned to this trip.")
            trip.cover_photo_id = photo_id
        return {"ok": True}

    def group_dates(self) -> dict:
        # Explicit user action. Names are date-based and editable, without inferred destinations.
        with self.library.lock, self.library.db.session.begin() as session:
            rows = list(
                session.scalars(
                    select(Photo).where(Photo.trip_id.is_(None)).order_by(Photo.captured_at)
                )
            )
            groups: dict[str, list[Photo]] = defaultdict(list)
            for photo in rows:
                groups[(photo.captured_at or photo.imported_at)[:10]].append(photo)
            for date, photos in groups.items():
                identifier = uuid.uuid4().hex
                session.add(
                    Trip(
                        id=identifier,
                        title="Memories · " + date,
                        start_date=date,
                        end_date=date,
                        cover_photo_id=photos[0].id,
                    )
                )
                for photo in photos:
                    photo.trip_id = identifier
        return {"created": len(groups)}

    def orbit(self, grouping: str) -> dict:
        with self.library.db.session() as session:
            total = session.scalar(select(func.count()).select_from(Photo)) or 0
            expression = (
                Photo.trip_id if grouping == "trip" else func.substr(Photo.captured_at, 1, 7)
            )
            groups = session.execute(
                select(expression, func.count(Photo.id))
                .group_by(expression)
                .order_by(func.max(Photo.captured_at).desc())
                .limit(4)
            ).all()
            titles = {trip.id: trip.title for trip in session.scalars(select(Trip))}
            rings = []
            for key, count in groups:
                condition = expression.is_(None) if key is None else expression == key
                photos = session.scalars(
                    select(Photo)
                    .where(condition)
                    .order_by(Photo.captured_at.desc(), Photo.id)
                    .limit(18)
                )
                rings.append(
                    {
                        "label": (
                            titles.get(key, "Unassigned")
                            if grouping == "trip"
                            else key or "Date unavailable"
                        ),
                        "count": count,
                        "photos": [photo_dict(p) for p in photos],
                    }
                )
            return {"total": total, "rings": rings}

    def index_existing(self) -> None:
        root = self.library.library_root()
        if root is None:
            return
        with self.library.db.session() as session:
            identifiers = list(session.scalars(select(Photo.id).where(Photo.metadata_version == 0)))
        for identifier in identifiers:
            if self.library.stop.is_set():
                return
            try:
                with self.library.db.session() as session:
                    photo = session.get(Photo, identifier)
                    item = session.get(Item, identifier)
                    info = extract(
                        owned(root / "originals", identifier + photo.extension),
                        item.modified_ms if item else None,
                        photo.imported_at,
                        self.privacy()["storeGps"],
                    )
                with Image.open(owned(self.library.thumbs, identifier + ".jpg")) as thumbnail:
                    visual = difference_hash(thumbnail)
                with self.library.lock, self.library.db.session.begin() as session:
                    photo = session.get(Photo, identifier)
                    if not self.privacy()["storeGps"]:
                        info["latitude"] = info["longitude"] = None
                    for key, value in info.items():
                        setattr(photo, key, value)
                    photo.visual_hash = visual
            except (OSError, StorageError, SQLAlchemyError):
                continue  # A missing drive can be retried at the next startup.

    def similar(self) -> dict:
        with self.library.db.session() as session:
            pairs = []
            for pair in session.scalars(
                select(SimilarPair)
                .where(SimilarPair.decision == "pending")
                .order_by(SimilarPair.distance)
                .limit(200)
            ):
                first, second = (
                    session.get(Photo, pair.first_id),
                    session.get(Photo, pair.second_id),
                )
                if first and second:
                    pairs.append(
                        {
                            "id": pair.id,
                            "first": photo_dict(first),
                            "second": photo_dict(second),
                            "distance": pair.distance,
                        }
                    )
            return {
                "state": self.scan_state,
                "processed": self.scan_progress,
                "total": self.scan_total,
                "pairs": pairs,
            }

    def scan_similar(self) -> dict:
        if not self.scan_lock.acquire(blocking=False):
            return self.similar()
        self.scan_state, self.scan_progress = "running", 0

        def work() -> None:
            try:
                self.index_existing()
                with self.library.db.session() as session:
                    rows = list(
                        session.execute(
                            select(Photo.id, Photo.visual_hash).where(
                                Photo.visual_hash.is_not(None)
                            )
                        )
                    )
                    reviewed = {
                        (p.first_id, p.second_id) for p in session.scalars(select(SimilarPair))
                    }
                self.scan_total = len(rows)
                buckets: dict[tuple[int, int], list[tuple[str, int]]] = defaultdict(list)
                suggestions = 0
                for index, (identifier, value) in enumerate(rows):
                    if self.library.stop.is_set():
                        self.scan_state = "interrupted"
                        return
                    number = int(value, 16)
                    candidates: dict[str, int] = {}
                    for segment in range(6):
                        key = (segment, (number >> (segment * 10)) & 1023)
                        candidates.update(buckets[key][-100:])
                    for other_id, other in candidates.items():
                        first, second = sorted((identifier, other_id))
                        distance = (number ^ other).bit_count()
                        if distance <= 5 and (first, second) not in reviewed and suggestions < 200:
                            with self.library.lock, self.library.db.session.begin() as session:
                                session.add(
                                    SimilarPair(
                                        id=uuid.uuid4().hex,
                                        first_id=first,
                                        second_id=second,
                                        distance=distance,
                                        decision="pending",
                                    )
                                )
                            reviewed.add((first, second))
                            suggestions += 1
                    for segment in range(6):
                        key = (segment, (number >> (segment * 10)) & 1023)
                        buckets[key].append((identifier, number))
                    self.scan_progress = index + 1
                self.scan_state = "complete"
            except (OSError, ValueError, SQLAlchemyError):
                self.scan_state = "failed"
            finally:
                self.scan_lock.release()

        self.scan_thread = threading.Thread(target=work, name="similarity-review", daemon=True)
        self.scan_thread.start()
        return self.similar()

    def review_pair(self, identifier: str, decision: str) -> dict:
        with self.library.lock, self.library.db.session.begin() as session:
            pair = session.get(SimilarPair, identifier)
            if not pair:
                raise StorageError("This suggestion could not be found.")
            pair.decision = decision
        return {"ok": True}
