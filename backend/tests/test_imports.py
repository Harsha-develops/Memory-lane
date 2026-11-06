import io
import os
import sqlite3
import struct
import time
import zlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.database import Database, Item
from app.library import Library
from app.main import create_app
from app.storage import MAX_BATCH, MAX_FILE, StorageError, safe_local

TOKEN = "a" * 64
HEADERS = {"Origin": "thing://app", "X-Thing-Token": TOKEN}


@pytest.fixture
def client(tmp_path: Path):
    app = create_app(TOKEN, data_root=tmp_path / "data")
    with TestClient(app, headers=HEADERS) as connection:
        parent = tmp_path / "chosen library"
        parent.mkdir()
        result = connection.post("/library", json={"path": str(parent)})
        assert result.status_code == 200, result.text
        yield connection


def photo_bytes(format: str = "JPEG", **options: object) -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (72, 48), "#863f58").save(output, format=format, **options)
    return output.getvalue()


def manifest(client: TestClient, names: list[str], bodies: list[bytes]) -> dict:
    response = client.post(
        "/jobs",
        json={
            "files": [
                {"name": name, "size": len(body)} for name, body in zip(names, bodies, strict=True)
            ]
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def finish(client: TestClient, identifier: str) -> dict:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        result = client.get(f"/jobs/{identifier}").json()
        if not result["active"]:
            return result
        time.sleep(0.05)
    pytest.fail("Import did not finish")


@pytest.mark.parametrize(
    "suffix,format",
    [
        (".jpg", "JPEG"),
        (".png", "PNG"),
        (".webp", "WEBP"),
        (".tiff", "TIFF"),
        (".heic", "HEIF"),
        (".avif", "AVIF"),
        (".bmp", "BMP"),
        (".gif", "GIF"),
    ],
)
def test_supported_formats_copy_and_preview(client: TestClient, suffix: str, format: str) -> None:
    data = photo_bytes(format)
    job = manifest(client, ["旅の写真 🌅" + suffix], [data])
    identifier = job["items"][0]["id"]
    assert client.put(f"/uploads/{identifier}", content=data).status_code == 200
    result = finish(client, job["id"])
    assert result["items"][0]["state"] == "added", result
    page = client.get("/photos").json()
    assert page["total"] == 1
    photo = page["photos"][0]
    for kind in ("thumbnail", "preview"):
        response = client.get(f"/photos/{photo['id']}/{kind}")
        assert response.status_code == 200
        with Image.open(io.BytesIO(response.content)) as preview:
            assert preview.format == "JPEG"
            assert not preview.getexif()
            assert max(preview.size) <= (480 if kind == "thumbnail" else 1600)
    library = client.app.state.library
    original = library.library_root() / "originals" / (photo["id"] + suffix)
    assert original.read_bytes() == data


def test_mixed_batch_isolated_errors_and_exact_duplicates(client: TestClient) -> None:
    valid = photo_bytes()
    job = manifest(
        client,
        ["one.jpg", "duplicate.jpg", "fake.jpg", "empty.png", "bad.exe", "wrong.png"],
        [valid, valid, b"not a photo", b"", b"abc", valid],
    )
    bodies = [valid, valid, b"not a photo", b"", b"abc", valid]
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [
            pool.submit(client.put, f"/uploads/{item['id']}", content=bodies[index])
            for index, item in enumerate(job["items"])
            if item["state"] == "pending"
        ]
        for future in futures:
            assert future.result().status_code == 200
    result = finish(client, job["id"])
    assert sorted(i["state"] for i in result["items"]) == sorted(
        ["added", "duplicate", "rejected", "rejected", "rejected", "rejected"]
    )
    assert client.get("/photos").json()["total"] == 1


def test_limits_and_unknown_fields(client: TestClient) -> None:
    assert (
        client.post("/jobs", json={"files": [{"name": "x.jpg", "size": 1}] * 201}).status_code
        == 422
    )
    assert (
        client.post("/jobs", json={"files": [{"name": "x.jpg", "size": MAX_BATCH + 1}]}).status_code
        == 400
    )
    assert (
        client.post(
            "/jobs", json={"files": [{"name": "x.jpg", "size": 1}], "unknown": True}
        ).status_code
        == 422
    )
    result = client.post(
        "/jobs", json={"files": [{"name": "large.jpg", "size": MAX_FILE + 1}]}
    ).json()
    assert result["items"][0]["state"] == "rejected"
    assert (
        client.put(
            "/uploads/" + "a" * 32, headers={"Content-Length": str(MAX_FILE + 1)}
        ).status_code
        == 413
    )


def test_orientation_and_thumbnail_metadata_stripping(client: TestClient) -> None:
    exif = Image.Exif()
    exif[274] = 6
    exif[306] = "2026:10:30 12:00:00"
    data = photo_bytes(exif=exif)
    job = manifest(client, ["portrait.jpg"], [data])
    client.put(f"/uploads/{job['items'][0]['id']}", content=data)
    finish(client, job["id"])
    photo = client.get("/photos").json()["photos"][0]
    assert (photo["width"], photo["height"]) == (48, 72)
    with Image.open(
        io.BytesIO(client.get(f"/photos/{photo['id']}/thumbnail").content)
    ) as thumbnail:
        assert thumbnail.size == (48, 72)
        assert not thumbnail.getexif()


def test_corruption_bomb_and_multipage_are_rejected(client: TestClient) -> None:
    png = bytearray(photo_bytes("PNG"))
    png[16:24] = struct.pack(">II", 100000, 100000)
    png[29:33] = struct.pack(">I", zlib.crc32(png[12:29]))
    pages = io.BytesIO()
    Image.new("RGB", (10, 10)).save(
        pages, format="TIFF", save_all=True, append_images=[Image.new("RGB", (10, 10))]
    )
    bodies = [photo_bytes()[:50], bytes(png), pages.getvalue(), b"fake raw"]
    job = manifest(client, ["truncated.jpg", "bomb.png", "pages.tiff", "fake.nef"], bodies)
    for item, body in zip(job["items"], bodies, strict=True):
        client.put(f"/uploads/{item['id']}", content=body)
    result = finish(client, job["id"])
    assert all(item["state"] == "rejected" for item in result["items"]), result


def test_cancel_leaves_existing_photos_intact(client: TestClient) -> None:
    data = photo_bytes()
    job = manifest(client, ["cancel.jpg"], [data])
    assert client.post(f"/jobs/{job['id']}/cancel", json={}).status_code == 200
    assert client.put(f"/uploads/{job['items'][0]['id']}", content=data).status_code == 409
    result = finish(client, job["id"])
    assert result["items"][0]["state"] == "cancelled"
    assert client.get("/photos").json()["total"] == 0


def test_path_traversal_and_unapproved_locations(client: TestClient) -> None:
    assert client.get("/photos/..%5C..%5Csecret/thumbnail").status_code == 422
    assert client.post("/library", json={"path": "\\\\server\\share"}).status_code == 400
    assert client.post("/library", json={"path": "C:\\CON"}).status_code == 400
    assert client.post("/library", json={"path": "C:\\folder\\..\\outside"}).status_code == 400
    assert client.get("/photos/" + "a" * 32 + "/thumbnail").status_code == 400


def test_restarts_resume_queued_copies_and_keep_catalog(tmp_path: Path) -> None:
    root = tmp_path / "data"
    parent = tmp_path / "photos"
    parent.mkdir()
    library = Library(root)
    library.configure(str(parent))
    data = photo_bytes()
    job = library.create_job([{"name": "resume.jpg", "size": len(data)}])
    identifier = job["items"][0]["id"]
    (library.staging / (identifier + ".stage")).write_bytes(data)
    with library.db.session.begin() as session:
        session.get(Item, identifier).state = "working"
    library.close()
    with TestClient(create_app(TOKEN, data_root=root), headers=HEADERS) as client:
        assert finish(client, job["id"])["items"][0]["state"] == "added"
    with TestClient(create_app(TOKEN, data_root=root), headers=HEADERS) as client:
        assert client.get("/photos").json()["total"] == 1


def test_migration_backup_and_future_schema_refusal(tmp_path: Path) -> None:
    database = Database(tmp_path)
    database.close()
    assert list((tmp_path / "backups").glob("*.db"))
    with sqlite3.connect(tmp_path / "library.db") as connection:
        connection.execute("UPDATE alembic_version SET version_num = ?", ("future_revision",))
    with pytest.raises(RuntimeError, match="newer"):
        Database(tmp_path)


@pytest.mark.parametrize("extension", ["NEF", "CR2"])
def test_real_raw_samples_when_supplied(client: TestClient, extension: str) -> None:
    directory = os.environ.get("THING_RAW_FIXTURES")
    if not directory:
        pytest.skip("Set THING_RAW_FIXTURES to public RAW sample directory")
    data = (Path(directory) / ("sample." + extension)).read_bytes()
    job = manifest(client, ["sample." + extension], [data])
    client.put(f"/uploads/{job['items'][0]['id']}", content=data)
    result = finish(client, job["id"])
    assert result["items"][0]["state"] == "added", result


def test_linked_source_is_rejected(tmp_path: Path) -> None:
    from unittest.mock import patch

    target = tmp_path / "safe"
    target.mkdir()
    with patch.object(Path, "is_symlink", return_value=True), pytest.raises(StorageError):
        safe_local(target)


def test_long_display_name_keeps_real_extension(client: TestClient) -> None:
    data = photo_bytes()
    job = manifest(client, ["a" * 230 + ".jpg"], [data])
    assert job["items"][0]["name"].endswith(".jpg")
    assert len(job["items"][0]["name"]) <= 180
    client.put(f"/uploads/{job['items'][0]['id']}", content=data)
    assert finish(client, job["id"])["items"][0]["state"] == "added"


@pytest.mark.parametrize("suffix", [".JPG", ".jpeg"])
def test_camera_mpo_jpeg_import_preserves_original_and_displays_primary(client, suffix):
    output = io.BytesIO()
    with (
        Image.new("RGB", (120, 80), "red") as primary,
        Image.new("RGB", (60, 40), "blue") as auxiliary,
    ):
        primary.save(output, format="MPO", save_all=True, append_images=[auxiliary])
    data = output.getvalue()
    with Image.open(io.BytesIO(data)) as check:
        assert check.format == "MPO" and check.n_frames == 2
    job = manifest(client, ["DSC-test" + suffix], [data])
    identifier = job["items"][0]["id"]
    assert client.put(f"/uploads/{identifier}", content=data).status_code == 200
    result = finish(client, job["id"])
    assert result["items"][0]["state"] == "added", result
    library = client.app.state.library
    assert library.organizer.original(identifier).read_bytes() == data
    for kind in ("thumbnail", "preview", "display"):
        response = client.get(f"/photos/{identifier}/{kind}")
        assert response.status_code == 200
        with Image.open(io.BytesIO(response.content)) as preview:
            assert preview.size == (120, 80)
            red, green, blue = preview.getpixel((20, 20))
            assert red > 200 and green < 30 and blue < 30
            assert not preview.getexif()


def test_png_disguised_as_jpg_still_rejected_with_actual_format(client):
    data = photo_bytes("PNG")
    job = manifest(client, ["wrong.JPG"], [data])
    identifier = job["items"][0]["id"]
    client.put(f"/uploads/{identifier}", content=data)
    result = finish(client, job["id"])
    assert result["items"][0]["state"] == "rejected"
    assert "PNG" in result["items"][0]["reason"]
    assert client.get("/photos").json()["total"] == 0
