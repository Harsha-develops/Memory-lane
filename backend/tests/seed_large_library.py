"""Synthetic performance fixture. Only writes into an explicitly supplied test directory."""

import sys
import uuid
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.database import Photo, Trip  # noqa: E402
from app.library import Library  # noqa: E402

root = Path(sys.argv[1]).resolve()
root.mkdir(parents=True, exist_ok=True)
library = Library(root / "catalog")
with library.db.session.begin() as session:
    trips = []
    for _index, title in enumerate(
        ["A red-letter weekend", "The quiet coast", "City after sunset", "Everyday gold"]
    ):
        identifier = uuid.uuid4().hex
        session.add(Trip(id=identifier, title=title))
        trips.append(identifier)
    for index in range(5000):
        identifier = f"{index + 1:032x}"
        trip = trips[index % 4]
        session.add(
            Photo(
                id=identifier,
                filename=f"Moment {index + 1:05d}.jpg",
                extension=".jpg",
                sha256=f"{index:064x}",
                mime_type="image/jpeg",
                width=600,
                height=400,
                imported_at="2026-10-31T00:00:00+00:00",
                captured_at=f"2024-07-{index % 28 + 1:02d}T12:00:00",
                date_source="exif",
                trip_id=trip,
                metadata_version=1,
            )
        )
        image = Image.new(
            "RGB", (240, 160), ["#742e43", "#a86a61", "#3c2939", "#ba8565"][index % 4]
        )
        draw = ImageDraw.Draw(image)
        draw.ellipse((110, 20, 175, 85), fill="#e0b179")
        draw.polygon([(0, 160), (0, 90), (80, 55), (170, 160)], fill="#412e3c")
        draw.polygon([(70, 160), (180, 65), (240, 85), (240, 160)], fill="#64354a")
        image.save(library.thumbs / (identifier + ".jpg"))
        image.save(library.previews / (identifier + ".jpg"))
library.db.close()
