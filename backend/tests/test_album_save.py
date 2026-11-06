import json
from pathlib import Path

import pytest

from app.database import Photo, Setting
from app.library import Library
from app.storage import StorageError

pytest_plugins = ["tests.test_organization", "tests.test_updates014"]


def plan(library, identifier, tmp_path):
    library.catalog.auto_categories(identifier, ["food"], ["food"])
    parent = tmp_path / "chosen"
    parent.mkdir(exist_ok=True)
    return library.saver.prepare([identifier], str(parent))


def test_save_tracks_one_copy_after_restart_and_old_drive_disconnect(imported, tmp_path):
    library, identifier, source, body = imported
    batch = plan(library, identifier, tmp_path)
    old_root = library.library_root()
    old = library.organizer.original(identifier)
    library.saver.move(identifier, batch["batch"])
    target = library.organizer.original(identifier)
    assert target.is_relative_to(Path(batch["folder"]))
    assert target.parent.name == "Food"
    assert not old.exists() and target.read_bytes() == body
    assert source.read_bytes() == body
    old_root.rename(old_root.with_name("disconnected"))
    restarted = Library(library.root)
    try:
        assert restarted.organizer.original(identifier) == target
        assert restarted.display_path(identifier).is_file()
        backups = tmp_path / "backups"
        backups.mkdir()
        restarted.tasks.backup(str(backups))
        restarted.tasks.thread.join(20)
        assert restarted.tasks.status()["state"] == "complete"
        restored = Library(tmp_path / "restore-profile" / "catalog")
        destination = tmp_path / "restore-destination"
        destination.mkdir()
        try:
            restored.tasks.restore(str(next(backups.iterdir())), str(destination))
            restored.tasks.thread.join(20)
            assert restored.tasks.status()["state"] == "complete"
            assert restored.organizer.original(identifier).read_bytes() == body
            assert restored.organizer.original(identifier).parent.name == "Food"
        finally:
            restored.close()
    finally:
        restarted.close()


def test_save_validates_classification_membership_and_destination(imported, tmp_path):
    library, identifier, source, body = imported
    with pytest.raises(StorageError, match="Finish categorising"):
        library.saver.prepare([identifier], str(tmp_path))
    batch = plan(library, identifier, tmp_path)
    with pytest.raises(StorageError, match="not in the chosen album"):
        library.saver.move("0" * 32, batch["batch"])
    for folder in [library.root, library.library_root()]:
        with pytest.raises(StorageError):
            library.saver.prepare([identifier], str(folder))
    library.saver.move(identifier, batch["batch"])
    with pytest.raises(StorageError):
        library.saver.prepare([identifier], batch["folder"])
    assert source.read_bytes() == body


def test_save_recovers_after_copy_before_source_delete(imported, tmp_path, monkeypatch):
    library, identifier, source, body = imported
    batch = plan(library, identifier, tmp_path)
    old = library.organizer.original(identifier)
    unlink = Path.unlink

    def interrupt(path, *args, **kwargs):
        if path == old:
            raise PermissionError("Simulated locked imported copy")
        return unlink(path, *args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(Path, "unlink", interrupt)
        with pytest.raises(PermissionError):
            library.saver.move(identifier, batch["batch"])
    assert old.read_bytes() == body
    with library.db.session() as session:
        assert session.get(Setting, "relocation:" + identifier)
    library.saver.recover()
    assert not old.exists()
    assert library.organizer.original(identifier).read_bytes() == body
    assert source.read_bytes() == body
    with library.db.session() as session:
        assert not session.get(Setting, "relocation:" + identifier)
    assert library.saver.move(identifier, batch["batch"]) == {"ok": True}


def test_collision_and_changed_source_never_delete(imported, tmp_path):
    library, identifier, source, body = imported
    batch = plan(library, identifier, tmp_path)
    old = library.organizer.original(identifier)
    with library.db.session() as session:
        relative = session.get(Photo, identifier).storage_path
    target = Path(batch["folder"]) / relative
    target.parent.mkdir(parents=True)
    target.write_bytes(b"Unrelated destination file")
    with pytest.raises(StorageError, match="different file"):
        library.saver.move(identifier, batch["batch"])
    assert old.read_bytes() == body and source.read_bytes() == body
    assert target.read_bytes() == b"Unrelated destination file"
    # Remove only this test's collision, then simulate a changed imported copy.
    target.unlink()
    old.write_bytes(b"Changed imported copy")
    with pytest.raises(StorageError, match="missing or has changed"):
        library.saver.finish(identifier)
    assert old.read_bytes() == b"Changed imported copy" and source.read_bytes() == body


def test_legacy_named_photo_migrates_without_ai(imported):
    library, identifier, source, body = imported
    label = library.catalog.new_person(identifier)["label"]
    library.catalog.rename_person(label, "Alex")
    library.catalog.auto_categories(identifier, [label, "backlit"], [label, "backlit"])
    old = library.organizer.original(identifier)
    relative = f"Organized/Backlit/Family--{identifier}.jpg"
    wrong = library.library_root() / relative
    wrong.parent.mkdir(parents=True)
    old.rename(wrong)
    with library.db.session.begin() as session:
        photo = session.get(Photo, identifier)
        photo.tags = json.dumps([label, "backlit"])
        photo.storage_path = relative
        photo.organized_label = "backlit"
    library.organizer.ensure_folders()
    assert library.organizer.original(identifier).parent.name == "Alex"
    assert library.catalog.detail(identifier)["tags"] == [label]
    assert library.catalog.query(tag="backlit")["total"] == 0
    assert not wrong.exists() and source.read_bytes() == body


def test_duplicate_review_deletes_relocated_copy_not_external_source(pair, tmp_path):
    library, pair_id, high, low, source_high, source_low, high_bytes, low_bytes = pair
    batch = plan(library, low, tmp_path)
    library.saver.move(low, batch["batch"])
    target = library.organizer.original(low)
    library.catalog.review_pair(pair_id, "similar")
    assert not target.exists()
    assert source_low.read_bytes() == low_bytes
    assert source_high.read_bytes() == high_bytes
    assert library.organizer.original(high).read_bytes() == high_bytes
    with library.db.session() as session:
        assert session.get(Setting, "photo_root:" + low) is None


def test_multiple_named_matches_choose_one_name_folder(pair):
    library, _, first, second, source, _, body, _ = pair
    alex = library.catalog.new_person(first)["label"]
    sam = library.catalog.new_person(second)["label"]
    library.catalog.rename_person(alex, "Alex")
    library.catalog.rename_person(sam, "Sam")
    library.catalog.auto_categories(first, [alex, sam, "sunlight"], [alex, sam, "sunlight"])
    assert library.catalog.detail(first)["tags"] == sorted([alex, sam])
    old = library.organizer.original(first)
    library.organizer.move(first, sam)
    assert library.organizer.original(first).parent.name == "Sam"
    assert not old.exists() and source.read_bytes() == body
    with pytest.raises(StorageError, match="named person"):
        library.organizer.move(first, "sunlight")


def test_correct_wrong_match_moves_saved_copy_and_stays_categorized(imported, tmp_path):
    library, identifier, source, body = imported
    person = library.catalog.new_person(identifier)["label"]
    library.catalog.rename_person(person, "Alex")
    batch = plan(library, identifier, tmp_path)
    library.saver.move(identifier, batch["batch"])
    old = library.organizer.original(identifier)
    result = library.catalog.correct_category(identifier, "food")
    assert result["tags"] == ["food"] and result["organizedLabel"] == "food"
    assert not old.exists()
    assert library.organizer.original(identifier).parent.name == "Food"
    assert library.organizer.original(identifier).read_bytes() == body
    assert source.read_bytes() == body
    assert library.catalog.people() == []
    assert library.catalog.auto_categories(identifier, [person], [person])["alreadyCategorized"]
    assert library.catalog.detail(identifier)["tags"] == ["food"]
    with pytest.raises(StorageError):
        library.catalog.correct_category(identifier, "person 999")
    with pytest.raises(StorageError):
        library.catalog.correct_category(identifier, "../outside")


def test_correction_requires_completed_available_photo(imported):
    library, identifier, _, body = imported
    with pytest.raises(StorageError, match="finish categorisation"):
        library.catalog.correct_category(identifier, "food")
    library.catalog.auto_categories(identifier, ["food"], ["food"])
    photo = library.organizer.original(identifier)
    photo.rename(photo.with_suffix(".offline"))
    with pytest.raises(StorageError, match="Reconnect"):
        library.catalog.correct_category(identifier, "scenery")
    assert library.catalog.detail(identifier)["tags"] == ["food"]
