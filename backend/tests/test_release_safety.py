import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine

from app.database import Database
from entry import recycle_app_data


def test_m2_catalog_upgrade_preserves_records_and_previous_schema(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'library.db').as_posix()}")
    config = Config()
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[1] / "migrations")
    )
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "0001_imports")
        connection.exec_driver_sql(
            "INSERT INTO photos VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            ("a" * 32, "memory.jpg", ".jpg", "hash", "image/jpeg", 80, 60, "2024-01-01T00:00:00"),
        )
    engine.dispose()
    database = Database(tmp_path)
    database.close()
    with sqlite3.connect(tmp_path / "library.db") as connection:
        assert connection.execute("SELECT filename, captured_at FROM photos").fetchone() == (
            "memory.jpg",
            "2024-01-01T00:00:00",
        )
        assert (
            connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
            == "0003_categories"
        )
    backups = list((tmp_path / "backups").glob("*.db"))
    assert backups
    with sqlite3.connect(backups[-1]) as connection:
        assert (
            connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
            == "0001_imports"
        )
        assert connection.execute("SELECT filename FROM photos").fetchone()[0] == "memory.jpg"


def test_uninstall_helper_targets_only_fixed_profile_and_keeps_external_originals(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("APPDATA", str(tmp_path))
    profile = tmp_path / "ThingSorted"
    catalog = profile / "catalog"
    catalog.mkdir(parents=True)
    originals = tmp_path / "external-originals"
    originals.mkdir()
    (originals / "photo.jpg").write_bytes(b"unchanged")
    with sqlite3.connect(catalog / "library.db") as connection:
        connection.execute("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)")
        connection.execute("INSERT INTO settings VALUES (?, ?)", ("library_root", str(originals)))
    targets = []
    monkeypatch.setattr("send2trash.send2trash", targets.append)
    assert recycle_app_data() == 0
    assert targets == [str(profile)]
    assert (originals / "photo.jpg").read_bytes() == b"unchanged"


def test_uninstall_helper_refuses_originals_nested_in_profile(tmp_path, monkeypatch):
    monkeypatch.setenv("APPDATA", str(tmp_path))
    profile = tmp_path / "ThingSorted"
    catalog = profile / "catalog"
    catalog.mkdir(parents=True)
    with sqlite3.connect(catalog / "library.db") as connection:
        connection.execute("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)")
        connection.execute(
            "INSERT INTO settings VALUES (?, ?)", ("library_root", str(profile / "photos"))
        )
    targets = []
    monkeypatch.setattr("send2trash.send2trash", targets.append)
    assert recycle_app_data() == 1
    assert targets == []
