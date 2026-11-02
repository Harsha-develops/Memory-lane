import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.database import Item
from app.library import Library
from app.main import create_app
from app.storage import StorageError
from tests.test_imports import HEADERS, TOKEN, finish, manifest, photo_bytes


def test_low_disk_rejection_retains_copy_for_retry(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    destination = tmp_path / "photos"
    destination.mkdir()
    app = create_app(TOKEN, data_root=tmp_path / "data")
    with TestClient(app, headers=HEADERS) as client:
        client.post("/library", json={"path": str(destination)})
        data = photo_bytes()
        job = manifest(client, ["retry.jpg"], [data])

        def no_space(_root: Path, _needed: int) -> None:
            raise StorageError("There is not enough free space. Free some space and try again.")

        with monkeypatch.context() as patch:
            patch.setattr("app.library.check_space", no_space)
            assert client.put(f"/uploads/{job['items'][0]['id']}", content=data).status_code == 200
            result = finish(client, job["id"])
            assert result["items"][0]["state"] == "rejected"
            assert client.get("/photos").json()["total"] == 0
        assert client.post(f"/jobs/{job['id']}/retry", json={}).status_code == 200
        assert finish(client, job["id"])["items"][0]["state"] == "added"


def test_interrupted_receive_requires_source_reselection(tmp_path: Path) -> None:
    chosen = tmp_path / "photos"
    chosen.mkdir()
    root = tmp_path / "data"
    library = Library(root)
    library.configure(str(chosen))
    data = photo_bytes()
    job = library.create_job([{"name": "interrupted.jpg", "size": len(data)}])
    item_id = job["items"][0]["id"]
    (library.staging / (item_id + ".part")).write_bytes(data[:30])
    with library.db.session.begin() as session:
        session.get(Item, item_id).state = "receiving"
    library.close()
    with TestClient(create_app(TOKEN, data_root=root), headers=HEADERS) as client:
        result = finish(client, job["id"])
        assert result["items"][0]["state"] == "rejected"
        assert "Select this file again" in result["items"][0]["reason"]
        assert not list((root / "staging").iterdir())


def test_long_unicode_library_path(tmp_path: Path) -> None:
    long_root = tmp_path
    while len(str(long_root)) < 280:
        long_root /= "旅の写真-collection"
    long_root.mkdir(parents=True)
    with TestClient(create_app(TOKEN, data_root=long_root / "data"), headers=HEADERS) as client:
        chosen = long_root / "chosen"
        chosen.mkdir()
        assert client.post("/library", json={"path": str(chosen)}).status_code == 200
        data = photo_bytes()
        job = manifest(client, ["旅 🌅.jpg"], [data])
        client.put(f"/uploads/{job['items'][0]['id']}", content=data)
        assert finish(client, job["id"])["items"][0]["state"] == "added"


def test_cancel_during_decode_never_commits_photo(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import threading

    from app.decoders import decode

    reached = threading.Event()
    resume = threading.Event()

    def pause_decode(path: Path, suffix: str):
        reached.set()
        resume.wait(timeout=10)
        return decode(path, suffix)

    monkeypatch.setattr("app.library.decode", pause_decode)
    root = tmp_path / "data"
    chosen = tmp_path / "photos"
    chosen.mkdir()
    with TestClient(create_app(TOKEN, data_root=root), headers=HEADERS) as client:
        client.post("/library", json={"path": str(chosen)})
        data = photo_bytes()
        job = manifest(client, ["cancel-working.jpg"], [data])
        client.put(f"/uploads/{job['items'][0]['id']}", content=data)
        assert reached.wait(timeout=5)
        client.post(f"/jobs/{job['id']}/cancel", json={})
        resume.set()
        result = finish(client, job["id"])
        assert result["items"][0]["state"] == "cancelled"
        assert client.get("/photos").json()["total"] == 0
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline and list(
            (chosen / "thing sorted library" / "originals").iterdir()
        ):
            time.sleep(0.05)
        assert not list((chosen / "thing sorted library" / "originals").iterdir())
