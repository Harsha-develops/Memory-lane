import hashlib

import pytest
from PIL import Image

from app.database import Item, Photo
from app.library import Library
from app.organizer import relative_item
from app.storage import StorageError


@pytest.fixture
def imported(tmp_path):
    library = Library(tmp_path / "profile" / "catalog")
    chosen = tmp_path / "copies"
    chosen.mkdir()
    library.configure(str(chosen))
    source = tmp_path / "Family Photo.jpg"
    Image.new("RGB", (100, 80), "#873454").save(source)
    body = source.read_bytes()
    job = library.create_job(
        [{"name": source.name, "size": len(body), "modified_ms": 1700000000000.0}]
    )
    identifier = job["items"][0]["id"]
    (library.staging / (identifier + ".stage")).write_bytes(body)
    with library.db.session.begin() as session:
        session.get(Item, identifier).state = "queued"
    library.process(identifier)
    yield library, identifier, source, body
    library.close()


def test_move_keeps_source_and_single_destination_and_skips_recategorization(imported):
    library, identifier, source, body = imported
    c = library.catalog
    person = c.new_person(identifier)["label"]
    c.rename_person(person, "Alex")
    old = library.organizer.original(identifier)
    c.auto_categories(identifier, [person, "portrait", "backlit"], [person, "portrait", "backlit"])
    result = library.organizer.move(identifier, person)
    target = library.organizer.original(identifier)
    assert not result["moved"] and target.parent.name == "Alex"
    assert not old.exists() and target.read_bytes() == body and source.read_bytes() == body
    assert len(list(library.library_root().rglob("*.jpg"))) == 1
    assert library.catalog.query(tag="portrait")["total"] == 0
    assert library.catalog.query(tag=person)["total"] == 1
    assert [album["title"] for album in library.catalog.albums()] == ["Alex"]
    assert c.auto_categories(identifier, ["food"], ["food"])["alreadyCategorized"]
    assert c.detail(identifier)["tags"] == ["backlit", person, "portrait"]
    assert not library.organizer.move(identifier, person)["moved"]
    library.organizer.move(identifier, "backlit")
    assert not target.exists()
    assert library.organizer.original(identifier).parent.name == "Backlit"
    assert library.display_path(identifier).is_file()
    assert hashlib.sha256(source.read_bytes()).digest() == hashlib.sha256(body).digest()


def test_empty_ai_result_is_complete_and_can_move_to_uncategorized(imported):
    library, identifier, _, _ = imported
    library.catalog.auto_categories(identifier, [], ["food"])
    assert library.catalog.detail(identifier)["categorized"]
    assert library.catalog.auto_categories(identifier, ["food"], ["food"])["alreadyCategorized"]
    library.organizer.move(identifier, "uncategorized")
    assert library.catalog.query(tag="uncategorized")["total"] == 1


def test_move_rejects_unclassified_or_nonmatching_destination(imported):
    library, identifier, _, body = imported
    with pytest.raises(StorageError):
        library.organizer.move(identifier, "food")
    library.catalog.auto_categories(identifier, ["food"], ["food"])
    with pytest.raises(StorageError):
        library.organizer.move(identifier, "../outside")
    assert library.organizer.original(identifier).read_bytes() == body


@pytest.mark.parametrize("after_rename", [False, True])
def test_move_journal_recovers_both_sides_of_interruption(imported, after_rename):
    library, identifier, _, body = imported
    library.catalog.auto_categories(identifier, ["food"], ["food"])
    source = library.organizer.original(identifier)
    relative = f"Organized/Food/Family--{identifier}.jpg"
    target = relative_item(library.library_root(), relative, create=True)
    with library.db.session.begin() as session:
        photo = session.get(Photo, identifier)
        photo.pending_path, photo.pending_label = relative, "food"
    if after_rename:
        source.rename(target)
    recovered = Library(library.root)
    recovered.organizer.recover_pending()
    try:
        assert recovered.organizer.original(identifier).read_bytes() == body
        assert recovered.catalog.detail(identifier)["organizedLabel"] == ("food")
        with recovered.db.session() as session:
            assert session.get(Photo, identifier).pending_path == ""
    finally:
        recovered.close()


def test_organized_photo_backup_restore_preserves_layout(imported, tmp_path):
    library, identifier, source, body = imported
    library.catalog.auto_categories(identifier, ["food"], ["food"])
    library.organizer.move(identifier, "food")
    backup_parent = tmp_path / "backups"
    backup_parent.mkdir()
    library.tasks.backup(str(backup_parent))
    library.tasks.thread.join(20)
    assert library.tasks.status()["state"] == "complete"
    restored = Library(tmp_path / "restored-profile" / "catalog")
    destination = tmp_path / "restore-location"
    destination.mkdir()
    try:
        restored.tasks.restore(str(next(backup_parent.iterdir())), str(destination))
        restored.tasks.thread.join(20)
        assert restored.tasks.status()["state"] == "complete"
        assert restored.catalog.detail(identifier)["categorized"]
        assert restored.catalog.detail(identifier)["organizedLabel"] == "food"
        target = restored.organizer.original(identifier)
        assert target.parent.name == "Food" and target.read_bytes() == body
        assert source.read_bytes() == body
        assert len(list(restored.library_root().rglob("*.jpg"))) == 1
    finally:
        restored.close()


@pytest.mark.parametrize(
    "relative",
    [
        "../outside.jpg",
        "Organized/../outside.jpg",
        "Organized/Food/../../outside.jpg",
        "/outside.jpg",
    ],
)
def test_organized_paths_cannot_escape_root(tmp_path, relative):
    with pytest.raises(StorageError):
        relative_item(tmp_path, relative, create=True)
