import json
import uuid
from pathlib import Path

import pytest
from PIL import Image, ImageDraw, ImageFilter
from sqlalchemy import select

from app.database import Item, Photo, Setting, SimilarPair
from app.library import Library
from app.storage import StorageError


def add(library, source, size=(800, 600), blur=0):
    image = Image.new("RGB", size, "#ddd")
    draw = ImageDraw.Draw(image)
    for x in range(0, size[0], 20):
        draw.line((x, 0, x, size[1]), fill="#202020", width=4)
    if blur:
        image = image.filter(ImageFilter.GaussianBlur(blur))
    image.save(source)
    body = source.read_bytes()
    job = library.create_job(
        [{"name": source.name, "size": len(body), "modified_ms": 1700000000000.0}]
    )
    identifier = job["items"][0]["id"]
    (library.staging / (identifier + ".stage")).write_bytes(body)
    with library.db.session.begin() as session:
        session.get(Item, identifier).state = "queued"
    library.process(identifier)
    return identifier, body


@pytest.fixture
def pair(tmp_path):
    library = Library(tmp_path / "profile" / "catalog")
    destination = tmp_path / "copies"
    destination.mkdir()
    library.configure(str(destination))
    high = tmp_path / "sharp.png"
    low = tmp_path / "blurred.png"
    first, high_bytes = add(library, high)
    second, low_bytes = add(library, low, (400, 300), 5)
    pair_id = uuid.uuid4().hex
    with library.db.session.begin() as session:
        session.add(SimilarPair(id=pair_id, first_id=first, second_id=second, distance=1))
    yield library, pair_id, first, second, high, low, high_bytes, low_bytes
    library.close()


def test_lower_quality_deleted_from_organized_library_only(pair):
    library, pair_id, high, low, source_high, source_low, high_bytes, low_bytes = pair
    library.catalog.auto_categories(low, ["food"], ["food"])
    low_copy = library.organizer.original(low)
    library.display_path(low)
    result = library.catalog.review_pair(pair_id, "similar")
    assert result["deletedName"] == source_low.name
    assert not low_copy.exists()
    assert library.organizer.original(high).read_bytes() == high_bytes
    assert source_high.read_bytes() == high_bytes and source_low.read_bytes() == low_bytes
    assert library.catalog.query()["total"] == 1
    assert not library.catalog.similar()["pairs"]
    assert not (library.previews / (low + "-display-v1.jpg")).exists()
    with library.db.session() as session:
        assert session.get(Photo, low) is None
        assert (
            session.scalar(select(Setting.key).where(Setting.key.startswith("pending_delete:")))
            is None
        )


def test_near_tie_keeps_one_and_keep_both_keeps_everything(pair, monkeypatch):
    library, pair_id, first, second, *_ = pair
    monkeypatch.setattr(library.duplicates, "score", lambda p: 10)
    library.catalog.review_pair(pair_id, "similar")
    assert library.catalog.query()["photos"][0]["id"] == min(first, second)


def test_missing_survivor_prevents_deletion(pair):
    library, pair_id, high, low, *_ = pair
    library.organizer.original(high).rename(
        library.organizer.original(high).with_suffix(".offline")
    )
    with pytest.raises(StorageError):
        library.catalog.review_pair(pair_id, "similar")
    assert library.organizer.original(low).is_file()
    assert library.catalog.query()["total"] == 2


def test_interrupted_delete_resumes_from_durable_intent(pair, monkeypatch):
    library, pair_id, high, low, _, source_low, _, original = pair
    actual_unlink = Path.unlink
    thumbnail = library.thumbs / (low + ".jpg")

    def interrupted(path, *args, **kwargs):
        if path == thumbnail:
            raise PermissionError("Simulated locked thumbnail")
        return actual_unlink(path, *args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(Path, "unlink", interrupted)
        with pytest.raises(PermissionError):
            library.catalog.review_pair(pair_id, "similar")
    assert not library.organizer.original(low).exists()
    with library.db.session() as session:
        assert session.get(Setting, "pending_delete:" + low)
    library.duplicates.recover()
    assert library.catalog.query()["total"] == 1
    assert library.organizer.original(high).exists()
    assert source_low.read_bytes() == original


def test_journal_cannot_delete_external_source(pair):
    library, _, _, low, _, source_low, _, body = pair
    with library.db.session.begin() as session:
        session.add(
            Setting(
                key="pending_delete:" + low,
                value=json.dumps({"path": str(source_low), "kept": low}),
            )
        )
    library.duplicates.recover()
    assert source_low.read_bytes() == body
    assert library.organizer.original(low).is_file()


def test_filtered_queue_and_others_rename_keep_single_physical_copy(pair):
    library, _, first, second, *_ = pair
    result = library.catalog.auto_categories(first, [], ["food"])
    assert result["organizedLabel"] == "others"
    assert library.organizer.original(first).parent.name == "Others"
    assert [p["id"] for p in library.catalog.query(uncategorized=True)["photos"]] == [second]
    library.catalog.rename_category("others", "Unsorted Moments")
    assert library.organizer.original(first).parent.name == "Unsorted Moments"
    assert library.catalog.albums()[0]["title"] == "Unsorted Moments"
    library.catalog.auto_categories(second, ["pottery"], ["pottery"])
    assert library.organizer.original(second).parent.name == "Pottery"
    assert library.catalog.category_names()["pottery"] == "Pottery"
    assert library.catalog.query(uncategorized=True)["total"] == 0
    assert len(list(library.library_root().rglob("*.png"))) == 2
    for name in ["../outside", "a" * 41, ""]:
        with pytest.raises(StorageError):
            library.catalog.rename_category("others", name)


def test_legacy_classified_photo_gets_folder_without_ai(pair):
    library, _, first, *_ = pair
    with library.db.session.begin() as session:
        photo = session.get(Photo, first)
        photo.tags, photo.categorized_at = '["scenery"]', "legacy"
    library.organizer.ensure_folders()
    assert library.organizer.original(first).parent.name == "Scenery"
    assert library.catalog.auto_categories(first, ["food"], ["food"])["alreadyCategorized"]
