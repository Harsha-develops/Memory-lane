import hashlib
import json

import pytest
from PIL import Image

from app.archives import ArchiveTasks, read_archive
from app.library import Library
from app.storage import StorageError


def wait(tasks):
    tasks.thread.join(20)
    assert not tasks.thread.is_alive()
    return tasks.status()


@pytest.fixture
def original(tmp_path):
    lib = Library(tmp_path / "first" / "catalog")
    parent = tmp_path / "photos"
    parent.mkdir()
    lib.configure(str(parent))
    # Exercise the real durable ingestion pipeline before exporting.
    path = tmp_path / "source.jpg"
    Image.new("RGB", (80, 60), "#863d58").save(path)
    body = path.read_bytes()
    job = lib.create_job(
        [{"name": "旅の写真.jpg", "size": len(body), "modified_ms": 1700000000000.0}]
    )
    identifier = job["items"][0]["id"]
    (lib.staging / (identifier + ".stage")).write_bytes(body)
    from app.database import Item

    with lib.db.session.begin() as session:
        session.get(Item, identifier).state = "queued"
    lib.process(identifier)
    assert lib.photos(0)["total"] == 1
    trip = lib.catalog.save_trip("A holiday", "2023-01-01", "2024-01-01", kind="album")
    lib.catalog.move([identifier], trip["id"])
    lib.catalog.cover(trip["id"], identifier)
    lib.catalog.save_tags(identifier, ["portrait", "backlit"])
    lib.catalog.new_person(identifier)
    lib.catalog.rename_person("person 1", "Alex")
    yield lib, path, body
    lib.close()


def test_backup_restore_roundtrip_and_source_unchanged(original, tmp_path):
    lib, path, body = original
    parent = tmp_path / "backups"
    parent.mkdir()
    lib.tasks.backup(str(parent))
    assert wait(lib.tasks)["state"] == "complete"
    backup = next(parent.iterdir())
    manifest = read_archive(backup)
    assert len(manifest.photos) == 1
    assert manifest.photos[0].sha256 == hashlib.sha256(body).hexdigest()
    restored = Library(tmp_path / "second" / "catalog")
    destination = tmp_path / "restored"
    destination.mkdir()
    try:
        restored.tasks.restore(str(backup), str(destination))
        assert wait(restored.tasks)["state"] == "complete"
        assert restored.photos(0)["total"] == 1
        assert restored.catalog.trips()[0]["title"] == "A holiday"
        assert restored.catalog.trips()[0]["kind"] == "album"
        photo = manifest.photos[0]
        assert (
            restored.library_root() / "originals" / (photo.id + photo.extension)
        ).read_bytes() == body
        assert path.read_bytes() == body
        assert restored.catalog.detail(photo.id)["dateSource"] == "file_modified"
        assert restored.catalog.detail(photo.id)["tags"] == ["backlit", "person 1", "portrait"]
        assert restored.catalog.people() == [{"id": photo.id, "label": "person 1"}]
        assert restored.catalog.person_names() == {"person 1": "Alex"}
        assert "Alex" in [album["title"] for album in restored.catalog.albums()]
    finally:
        restored.close()


def test_restore_refuses_nonempty_collection(original, tmp_path):
    lib, _, _ = original
    parent = tmp_path / "backups"
    parent.mkdir()
    lib.tasks.backup(str(parent))
    wait(lib.tasks)
    with pytest.raises(StorageError, match="empty collection"):
        lib.tasks.restore(str(next(parent.iterdir())), str(tmp_path))
    assert lib.photos(0)["total"] == 1


def test_tampered_backup_is_rejected_before_catalog_commit(original, tmp_path):
    lib, _, _ = original
    parent = tmp_path / "backups"
    parent.mkdir()
    lib.tasks.backup(str(parent))
    wait(lib.tasks)
    backup = next(parent.iterdir())
    photo = next((backup / "originals").iterdir())
    photo.write_bytes(b"x" * photo.stat().st_size)
    restored = Library(tmp_path / "second" / "catalog")
    target = tmp_path / "restore"
    target.mkdir()
    try:
        restored.tasks.restore(str(backup), str(target))
        assert wait(restored.tasks)["state"] == "failed"
        assert restored.photos(0)["total"] == 0
    finally:
        restored.close()


def test_manifest_rejects_traversal_ids(original, tmp_path):
    lib, _, _ = original
    parent = tmp_path / "backups"
    parent.mkdir()
    lib.tasks.backup(str(parent))
    wait(lib.tasks)
    backup = next(parent.iterdir())
    manifest = backup / "manifest.json"
    content = json.loads(manifest.read_text(encoding="utf-8"))
    content["photos"][0]["id"] = "../../outside"
    manifest.write_text(json.dumps(content), encoding="utf-8")
    with pytest.raises(StorageError):
        read_archive(backup)


def test_cancel_resume_and_restart_status(original, tmp_path, monkeypatch):
    lib, _, _ = original
    parent = tmp_path / "backups"
    parent.mkdir()
    checkpoint = lib.tasks._checkpoint
    monkeypatch.setattr(lib.tasks, "_checkpoint", lambda: (_ for _ in ()).throw(InterruptedError()))
    lib.tasks.backup(str(parent))
    assert wait(lib.tasks)["state"] == "cancelled"
    monkeypatch.setattr(lib.tasks, "_checkpoint", checkpoint)
    lib.tasks.resume()
    assert wait(lib.tasks)["state"] == "complete"
    lib.tasks.job["state"] = "running"
    lib.tasks._save()
    replacement = ArchiveTasks(lib)
    assert replacement.status()["state"] == "interrupted"
    replacement.resume()
    assert wait(replacement)["state"] == "complete"


def test_backups_never_go_inside_original_library(original):
    lib, _, _ = original
    with pytest.raises(StorageError, match="outside"):
        lib.tasks.backup(str(lib.library_root()))
