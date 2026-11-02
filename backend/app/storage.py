"""Owned storage paths, bounded copies and atomic writes."""

import os
import re
import shutil
from pathlib import Path

MAX_FILE = 256 * 1024 * 1024
MAX_BATCH = 2 * 1024 * 1024 * 1024
MAX_FILES = 200
MAX_PIXELS = 80_000_000
RESERVED = re.compile(r"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)", re.I)
IDENTIFIER = re.compile(r"^[a-f0-9]{32}$")


class StorageError(ValueError):
    pass


def safe_local(path: Path, *, exists: bool = True) -> Path:
    if not path.is_absolute() or str(path).startswith(("\\\\", "//")):
        raise StorageError("Choose a local folder on this computer.")
    for part in path.parts[1:]:
        if part in ("..", ".") or part.rstrip(" .") != part or RESERVED.match(part):
            raise StorageError("This folder name is not supported.")
        if any(c in part for c in '<>:"|?*\x00'):
            raise StorageError("This folder name is not supported.")
    for item in (path, *path.parents):
        try:
            info = item.lstat()
        except FileNotFoundError:
            continue
        if item.is_symlink() or getattr(info, "st_file_attributes", 0) & 0x400:
            raise StorageError("Linked folders and files are not supported.")
    return path.resolve(strict=exists)


def owned(root: Path, filename: str) -> Path:
    parent = safe_local(root)
    candidate = safe_local(parent / filename, exists=False)
    if candidate.parent != parent:
        raise StorageError("Invalid library item.")
    return candidate


def display_name(value: str) -> str:
    value = value.replace("\\", "/").split("/")[-1]
    cleaned = "".join(
        c
        for c in value
        if c.isprintable() and c not in "\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069"
    )
    suffix = Path(cleaned).suffix[:12]
    if len(cleaned) > 180:
        cleaned = cleaned[: 180 - len(suffix)] + suffix
    return cleaned or "Untitled photo"


def flush_file(file: object) -> None:
    file.flush()  # type: ignore[attr-defined]
    os.fsync(file.fileno())  # type: ignore[attr-defined]


def check_space(root: Path, needed: int) -> None:
    if shutil.disk_usage(root).free < needed + 100 * 1024 * 1024:
        raise StorageError("There is not enough free space. Free some space and try again.")


def copy_original(source: Path, destination: Path) -> None:
    temporary = destination.with_suffix(destination.suffix + ".copying")
    # Both names belong to this generated item ID, never to an external original.
    if destination.exists():
        return  # Recover an interrupted pre-commit copy; the caller verifies its hash.
    with source.open("rb") as src, temporary.open("wb") as target:
        shutil.copyfileobj(src, target, 1024 * 1024)
        flush_file(target)
    temporary.rename(destination)  # Windows rename refuses to overwrite an existing file.
