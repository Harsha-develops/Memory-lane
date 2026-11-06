"""Transactional import catalog and Alembic schema safety."""

import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Boolean, Float, Integer, String, create_engine, event, inspect
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from app.storage import safe_local


class Base(DeclarativeBase):
    pass


class Photo(Base):
    __tablename__ = "photos"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    filename: Mapped[str] = mapped_column(String)
    extension: Mapped[str] = mapped_column(String)
    sha256: Mapped[str] = mapped_column(String, unique=True)
    mime_type: Mapped[str] = mapped_column(String)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    imported_at: Mapped[str] = mapped_column(String)
    trip_id: Mapped[str | None] = mapped_column(String, nullable=True)
    captured_at: Mapped[str | None] = mapped_column(String, nullable=True)
    date_source: Mapped[str] = mapped_column(String, default="import_time")
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    metadata_version: Mapped[int] = mapped_column(Integer, default=0)
    tags: Mapped[str] = mapped_column(String, default="[]")
    person_ref: Mapped[str] = mapped_column(String, default="")
    categorized_at: Mapped[str] = mapped_column(String, default="", server_default="")
    storage_path: Mapped[str] = mapped_column(String, default="", server_default="")
    organized_label: Mapped[str] = mapped_column(String, default="", server_default="")
    pending_path: Mapped[str] = mapped_column(String, default="", server_default="")
    pending_label: Mapped[str] = mapped_column(String, default="", server_default="")

    visual_hash: Mapped[str | None] = mapped_column(String, nullable=True)


class Trip(Base):
    __tablename__ = "trips"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String, default="trip", server_default="trip")
    start_date: Mapped[str | None] = mapped_column(String, nullable=True)
    end_date: Mapped[str | None] = mapped_column(String, nullable=True)
    cover_photo_id: Mapped[str | None] = mapped_column(String, nullable=True)


class SimilarPair(Base):
    __tablename__ = "similar_pairs"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    first_id: Mapped[str] = mapped_column(String)
    second_id: Mapped[str] = mapped_column(String)
    distance: Mapped[int] = mapped_column(Integer)
    decision: Mapped[str] = mapped_column(String, default="pending")


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[str] = mapped_column(String)
    cancelled: Mapped[bool] = mapped_column(Boolean, default=False)


class Item(Base):
    __tablename__ = "import_items"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    job_id: Mapped[str] = mapped_column(String, index=True)
    filename: Mapped[str] = mapped_column(String)
    size: Mapped[int] = mapped_column(Integer)
    ordinal: Mapped[int] = mapped_column(Integer)
    modified_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    state: Mapped[str] = mapped_column(String)
    reason: Mapped[str] = mapped_column(String, default="")
    photo_id: Mapped[str | None] = mapped_column(String, nullable=True)


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(String)


class Database:
    def __init__(self, data_root: Path) -> None:
        self.path = safe_local(data_root / "library.db", exists=False)
        self.engine = create_engine(
            f"sqlite:///{self.path.as_posix()}", connect_args={"timeout": 15}
        )

        @event.listens_for(self.engine, "connect")
        def configure(connection: sqlite3.Connection, _record: object) -> None:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA synchronous=FULL")
            connection.execute("PRAGMA foreign_keys=ON")

        with self.engine.connect() as connection:
            tables = inspect(connection).get_table_names()
            revision = None
            if "alembic_version" in tables:
                revision = connection.exec_driver_sql(
                    "SELECT version_num FROM alembic_version"
                ).scalar()
            if revision not in (
                None,
                "0001_imports",
                "0002_collections",
                "0003_categories",
                "0004_collection_kind",
                "0005_organization",
            ):
                self.engine.dispose()
                raise RuntimeError("Database schema is newer than this application.")
            if revision is None and any(t != "alembic_version" for t in tables):
                self.engine.dispose()
                raise RuntimeError("Unrecognized database schema.")
        if revision != "0005_organization":
            if self.path.stat().st_size:
                backup_dir = data_root / "backups"
                backup_dir.mkdir(exist_ok=True)
                safe_local(backup_dir)
                backup = (
                    backup_dir / f"before-0005-{datetime.now(UTC).strftime('%Y%m%d%H%M%S%f')}.db"
                )
                with sqlite3.connect(self.path) as src, sqlite3.connect(backup) as dst:
                    src.backup(dst)
            config = Config()
            config.set_main_option(
                "script_location", str(Path(__file__).resolve().parents[1] / "migrations")
            )
            with self.engine.begin() as connection:
                config.attributes["connection"] = connection
                command.upgrade(config, "head")
        self.session = sessionmaker(self.engine, expire_on_commit=False)

    def close(self) -> None:
        self.engine.dispose()
