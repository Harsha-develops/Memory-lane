"""Generate synthetic desktop-test images; never inspect a user's photo library."""

import sys
from pathlib import Path

from PIL import Image, ImageDraw
from pillow_heif import register_heif_opener


def create(root: Path) -> None:
    register_heif_opener()
    root.mkdir(parents=True, exist_ok=True)
    names = [
        ("01-desert.jpg", "JPEG"),
        ("02-mountain.png", "PNG"),
        ("03-lake.webp", "WEBP"),
        ("04-architecture.tiff", "TIFF"),
        ("05-evening-旅.heic", "HEIF"),
    ]
    palettes = [
        ("#d9c1a7", "#8c5360", "#b98c75"),
        ("#bba6a6", "#6e485c", "#3b293c"),
        ("#c6afb0", "#73505e", "#c7ad83"),
        ("#dac7b7", "#78394d", "#ab8070"),
        ("#986576", "#442b3c", "#b89670"),
    ]
    for index, ((name, format), (sky, mountain, foreground)) in enumerate(
        zip(names, palettes, strict=True)
    ):
        image = Image.new("RGB", (1000, 760), sky)
        draw = ImageDraw.Draw(image)
        draw.ellipse((650, 90, 790, 230), fill="#f4ddae")
        draw.polygon(
            [(0, 620), (250 + index * 30, 220), (640, 630), (1000, 280), (1000, 760), (0, 760)],
            fill=mountain,
        )
        draw.ellipse((-300, 550 - index * 20, 1200, 1000), fill=foreground)
        if index == 3:
            draw.rectangle((310, 250, 640, 690), fill="#7b4352")
            draw.rounded_rectangle((390, 350, 560, 720), radius=85, fill="#322231")
        image.save(root / name, format=format)
    (root / "06-corrupt.jpg").write_bytes(b"This is a synthetic corrupt-file test.")
    (root / "07-duplicate.jpg").write_bytes((root / names[0][0]).read_bytes())


if __name__ == "__main__":
    create(Path(sys.argv[1]))
