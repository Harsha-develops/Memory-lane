"""Read dates and coordinates without changing image files or inventing metadata."""

import math
from datetime import UTC, datetime
from pathlib import Path

from PIL import Image


def exif_date(value: object, offset: object = None) -> str | None:
    if isinstance(value, bytes):
        value = value.decode("ascii", errors="ignore")
    if not isinstance(value, str):
        return None
    try:
        date = datetime.strptime(value.strip("\x00 "), "%Y:%m:%d %H:%M:%S")
        result = date.isoformat()
        if isinstance(offset, str) and len(offset) == 6 and offset[0] in "+-":
            result = datetime.fromisoformat(result + offset).isoformat()
        return result
    except (ValueError, OverflowError):
        return None


def coordinate(parts: object, reference: object, maximum: int) -> float | None:
    try:
        if not isinstance(parts, (tuple, list)) or len(parts) != 3:
            return None
        values = [float(part) for part in parts]
        if (
            not all(math.isfinite(v) and v >= 0 for v in values)
            or values[1] >= 60
            or values[2] >= 60
        ):
            return None
        value = values[0] + values[1] / 60 + values[2] / 3600
        if isinstance(reference, bytes):
            reference = reference.decode("ascii")
        if reference not in ("N", "S", "E", "W") or value > maximum:
            return None
        return -value if reference in ("S", "W") else value
    except (ValueError, TypeError, ZeroDivisionError, OverflowError, UnicodeError):
        return None


def extract(path: Path, modified_ms: float | None, imported_at: str, store_gps: bool) -> dict:
    date = None
    latitude = longitude = None
    try:
        with Image.open(path) as image:
            exif = image.getexif()
            detail = exif.get_ifd(34665) if exif.get(34665) else {}
            date = exif_date(detail.get(36867, exif.get(36867)), detail.get(36881, exif.get(36881)))
            if store_gps and exif.get(34853):
                gps = exif.get_ifd(34853)
                latitude = coordinate(gps.get(2), gps.get(1), 90)
                longitude = coordinate(gps.get(4), gps.get(3), 180)
                if latitude is None or longitude is None:
                    latitude = longitude = None
    except (
        OSError,
        ValueError,
        TypeError,
        KeyError,
        SyntaxError,
        ZeroDivisionError,
        OverflowError,
        Image.DecompressionBombError,
    ):
        # An unsupported metadata block must not make a successfully decoded photo unusable.
        pass
    source = "exif" if date else "import_time"
    if not date and modified_ms is not None:
        try:
            if math.isfinite(modified_ms) and modified_ms >= 0:
                date = datetime.fromtimestamp(modified_ms / 1000, UTC).isoformat()
                source = "file_modified"
        except (ValueError, OverflowError, OSError):
            date = None
    return {
        "captured_at": date or imported_at,
        "date_source": source,
        "latitude": latitude,
        "longitude": longitude,
        "metadata_version": 1,
    }


def difference_hash(image: Image.Image) -> str:
    with image.convert("L") as grey:
        with grey.resize((9, 8), Image.Resampling.LANCZOS) as small:
            pixels = list(small.get_flattened_data())
            result = 0
            for row in range(8):
                for column in range(8):
                    result = (result << 1) | int(
                        pixels[row * 9 + column] > pixels[row * 9 + column + 1]
                    )
            return f"{result:016x}"
