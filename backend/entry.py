"""Frozen Windows entry point; keep console pipes for the parent handshake."""

import multiprocessing
import os
import sqlite3
import sys
from pathlib import Path


def recycle_app_data() -> int:
    from send2trash import send2trash

    from app.storage import safe_local

    # No caller-controlled paths. External original libraries are never touched.
    base = os.environ.get("APPDATA")
    if not base:
        return 2
    target = Path(base) / "ThingSorted"
    if not target.exists():
        return 0
    try:
        safe_local(target)
        if target.resolve().parent != Path(base).resolve():
            return 2
        database = target / "catalog" / "library.db"
        if database.exists():
            with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as connection:
                result = connection.execute(
                    "SELECT value FROM settings WHERE key='library_root'"
                ).fetchone()
                if result and Path(result[0]).resolve().is_relative_to(target.resolve()):
                    return 1  # Keep the profile if someone placed their originals inside it.
        send2trash(str(target))
        return 0
    except (OSError, ValueError, sqlite3.Error):
        return 1


if __name__ == "__main__":
    multiprocessing.freeze_support()
    if sys.argv[1:] == ["--recycle-app-data"]:
        raise SystemExit(recycle_app_data())
    if sys.argv[1:]:
        raise SystemExit(2)
    from app.runner import main

    raise SystemExit(main())
