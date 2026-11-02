import hashlib
import uuid
from pathlib import Path

import pytest
from PIL import Image

from app.database import Photo, SimilarPair
from app.library import Library
from app.metadata import coordinate, difference_hash, extract
from app.storage import StorageError


@pytest.fixture
def library(tmp_path):
    result = Library(tmp_path / "data")
    with result.db.session.begin() as session:
        for i in range(4):
            session.add(
                Photo(
                    id=f"{i + 1:032x}",
                    filename=f"photo-{i}.jpg",
                    extension=".jpg",
                    sha256=str(i),
                    mime_type="image/jpeg",
                    width=80,
                    height=60,
                    imported_at="2026-10-31T00:00:00+00:00",
                    captured_at=f"2024-02-{i + 1:02d}T12:00:00",
                    date_source="exif",
                    latitude=12.5,
                    longitude=77.5,
                    metadata_version=1,
                    visual_hash="0000000000000000" if i < 2 else f"{i:016x}",
                )
            )
    yield result
    result.stop.set()
    if result.catalog.scan_thread:
        result.catalog.scan_thread.join(5)
    result.db.engine.dispose()


def test_trip_move_filter_cover_delete_persistence(library):
    c = library.catalog
    trip = c.save_trip(" A holiday ", "2024-02-01", "2024-02-04")
    assert trip["title"] == "A holiday"
    ids = [f"{i:032x}" for i in (1, 2)]
    c.move(ids, trip["id"])
    c.cover(trip["id"], ids[1])
    assert c.trips()[0]["count"] == 2
    assert c.trips()[0]["coverPhotoId"] == ids[1]
    assert c.query(trip=trip["id"])["total"] == 2
    assert c.query(trip="unassigned")["total"] == 2
    assert c.query(start="2024-02-02", end="2024-02-02")["total"] == 1
    assert c.query(search="photo-2")["total"] == 1
    assert c.query(search="%")["total"] == 0
    c.save_trip("Renamed", None, None, trip["id"])
    assert c.trips()[0]["title"] == "Renamed"
    c.delete_trip(trip["id"])
    assert c.trips() == []
    assert c.query(trip="unassigned")["total"] == 4


def test_invalid_actions_are_atomic(library):
    c = library.catalog
    with pytest.raises(StorageError):
        c.save_trip("bad range", "2025-02-01", "2024-01-01")
    with pytest.raises(StorageError):
        c.move([f"{1:032x}", uuid.uuid4().hex], None)
    with pytest.raises(StorageError):
        c.cover(uuid.uuid4().hex, f"{1:032x}")
    assert c.query()["total"] == 4


def test_privacy_hides_and_forgets_only_catalog_coordinates(library):
    c = library.catalog
    assert c.detail(f"{1:032x}")["latitude"] is None
    c.set_privacy(True, True)
    assert c.detail(f"{1:032x}")["latitude"] == 12.5
    c.forget_locations()
    assert c.privacy() == {"showGps": False, "storeGps": False}
    c.set_privacy(True, False)
    assert c.detail(f"{1:032x}")["latitude"] is None
    assert c.query()["total"] == 4


def test_grouping_is_explicit_idempotent_and_orbit_bounded(library):
    c = library.catalog
    assert c.trips() == []
    assert c.group_dates()["created"] == 4
    assert c.group_dates()["created"] == 0
    result = c.orbit("trip")
    assert result["total"] == 4
    assert len(result["rings"]) == 4
    assert len(c.orbit("month")["rings"]) == 1


def test_similarity_review_is_persistent_and_never_deletes(library):
    c = library.catalog
    c.scan_similar()
    c.scan_thread.join(10)
    assert c.scan_state == "complete"
    pairs = c.similar()["pairs"]
    assert pairs
    pair = pairs[0]
    c.review_pair(pair["id"], "keep")
    c.scan_similar()
    c.scan_thread.join(10)
    assert pair["id"] not in {p["id"] for p in c.similar()["pairs"]}
    with library.db.session() as session:
        assert session.get(SimilarPair, pair["id"]).decision == "keep"
    assert c.query()["total"] == 4


def test_real_exif_date_gps_and_original_hash(tmp_path: Path):
    path = tmp_path / "camera.jpg"
    exif = Image.Exif()
    exif[34665] = {36867: "2022:07:14 15:16:17", 36881: "+05:30"}
    exif[34853] = {1: "N", 2: (12.0, 30.0, 0.0), 3: "E", 4: (77.0, 30.0, 0.0)}
    Image.new("RGB", (80, 60), "#883344").save(path, exif=exif)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    result = extract(path, 1000, "2026-01-01T00:00:00", True)
    assert result["captured_at"] == "2022-07-14T15:16:17+05:30"
    assert result["date_source"] == "exif"
    assert (result["latitude"], result["longitude"]) == (12.5, 77.5)
    assert extract(path, None, "", False)["latitude"] is None
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest


def test_missing_metadata_falls_back_without_guessing(tmp_path):
    path = tmp_path / "plain.png"
    Image.new("RGB", (80, 60), "#883344").save(path)
    assert extract(path, 1000, "fallback", True)["date_source"] == "file_modified"
    assert extract(path, None, "fallback", True)["captured_at"] == "fallback"
    assert coordinate((91, 0, 0), "N", 90) is None
    assert coordinate((12, 60, 0), "N", 90) is None
    with Image.open(path) as image:
        assert len(difference_hash(image)) == 16


def test_categories_are_multiple_filterable_and_references_stable(library):
    c = library.catalog
    first, second = f"{1:032x}", f"{2:032x}"
    c.save_tags(first, ["Food", "backlit", "food"])
    assert c.detail(first)["tags"] == ["backlit", "food"]
    assert c.query(tag="food")["total"] == 1
    assert c.query(tag="foo")["total"] == 0
    assert c.new_person(first) == {"label": "person 1"}
    assert c.new_person(first) == {"label": "person 1"}
    assert c.people() == [{"id": first, "label": "person 1"}]
    c.remove_person_reference(first)
    assert c.new_person(second) == {"label": "person 2"}
    assert c.query(tag="person 1")["total"] == 1
    assert {row["label"] for row in c.categories()} == {"food", "backlit", "person 1", "person 2"}
    c.save_tags(first, [])
    assert c.query(tag="food")["total"] == 0


def test_invalid_categories_never_replace_existing_labels(library):
    c = library.catalog
    identifier = f"{1:032x}"
    c.save_tags(identifier, ["scenery"])
    for tags in [["<script>"], ["a" * 41], [str(i) for i in range(65)]]:
        with pytest.raises(StorageError):
            c.save_tags(identifier, tags)
    assert c.detail(identifier)["tags"] == ["scenery"]
    with pytest.raises(StorageError):
        c.save_tags("f" * 32, ["food"])


def test_ai_automatically_populates_multiple_albums_and_replaces_only_selected_scope(library):
    c = library.catalog
    first = f"{1:032x}"
    c.auto_categories(first, ["food", "sunlight"], ["food", "sunlight", "portrait"])
    assert {a["title"] for a in c.albums()} == {"Food", "Sunlight"}
    assert all(a["count"] == 1 for a in c.albums())
    c.auto_categories(first, [], ["food"])
    assert c.detail(first)["tags"] == ["sunlight"]
    with pytest.raises(StorageError):
        c.auto_categories(first, ["portrait"], ["food"])
    assert c.detail(first)["tags"] == ["sunlight"]
    label = c.new_person(first)["label"]
    c.rename_person(label, "Alex")
    assert c.person_names() == {"person 1": "Alex"}
    assert {a["title"] for a in c.albums()} == {"Alex", "Sunlight"}
    c.rename_person(label, "Alexandra")
    assert {a["title"] for a in c.albums()} == {"Alexandra", "Sunlight"}
