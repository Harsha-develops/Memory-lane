"""Strict image decoding. Originals are only read; previews have no embedded metadata."""

import warnings
from dataclasses import dataclass
from pathlib import Path

import rawpy
from PIL import Image, ImageFile, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

from app.storage import MAX_PIXELS, StorageError, flush_file

register_heif_opener(thumbnails=False)
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
ImageFile.LOAD_TRUNCATED_IMAGES = False
RASTER = {
    ".jpg": "JPEG",
    ".jpeg": "JPEG",
    ".png": "PNG",
    ".webp": "WEBP",
    ".heic": "HEIF",
    ".heif": "HEIF",
    ".tif": "TIFF",
    ".tiff": "TIFF",
    ".bmp": "BMP",
    ".gif": "GIF",
    ".avif": "AVIF",
}
RAW = {
    ".dng",
    ".cr2",
    ".cr3",
    ".nef",
    ".nrw",
    ".arw",
    ".sr2",
    ".orf",
    ".rw2",
    ".raf",
    ".pef",
    ".raw",
    ".rwl",
    ".3fr",
    ".iiq",
}
EXTENSIONS = set(RASTER) | RAW


@dataclass
class Decoded:
    image: Image.Image
    width: int
    height: int
    mime: str


def dimensions(width: int, height: int) -> None:
    if width < 1 or height < 1 or width * height > MAX_PIXELS:
        raise StorageError("This image exceeds the 80-megapixel safety limit.")


def decode(path: Path, suffix: str, *, full_resolution: bool = False) -> Decoded:
    if suffix not in EXTENSIONS:
        raise StorageError("This file format is not supported.")
    try:
        if suffix in RAW:
            with rawpy.RawPy() as raw:
                raw.open_file(str(path))
                dimensions(raw.sizes.raw_width, raw.sizes.raw_height)
                raw.unpack()
                pixels = raw.postprocess(
                    half_size=not full_resolution, use_camera_wb=True, output_bps=8
                )
                image = Image.fromarray(pixels)
                # RAW previews use half-resolution demosaicing; report sensor dimensions.
                return Decoded(image, raw.sizes.width, raw.sizes.height, "image/x-camera-raw")
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(path) as check:
                # Camera JPEGs can carry an MPF index for auxiliary pictures. Pillow
                # identifies these as MPO; display the primary JPEG and preserve all bytes.
                camera_jpeg = suffix in {".jpg", ".jpeg"} and check.format == "MPO"
                if check.format != RASTER[suffix] and not camera_jpeg:
                    raise StorageError(
                        f"This file is detected as {check.format}, but its extension expects "
                        f"{RASTER[suffix]}. Export it in the matching format and import again."
                    )
                dimensions(*check.size)
                if getattr(check, "n_frames", 1) > 1 and not camera_jpeg:
                    raise StorageError(
                        "Multi-page and animated images are not supported yet. "
                        "Export a still image first."
                    )
                check.verify()
            with Image.open(path) as source:
                source.load()
                oriented = ImageOps.exif_transpose(source)
                image = oriented.convert("RGB")
                if "A" in oriented.getbands():
                    background = Image.new("RGB", oriented.size, "#f4eada")
                    background.paste(oriented, mask=oriented.getchannel("A"))
                    image.close()
                    image = background
                image.info.clear()
                return Decoded(
                    image, image.width, image.height, Image.MIME.get(RASTER[suffix], "image/heif")
                )
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise StorageError("This image exceeds the 80-megapixel safety limit.") from exc
    except (UnidentifiedImageError, OSError, ValueError, rawpy.LibRawError) as exc:
        if isinstance(exc, StorageError):
            raise
        raise StorageError("This image is damaged or its camera/codec is not supported.") from exc


def save_preview(image: Image.Image, destination: Path, edge: int, quality: int = 88) -> None:
    temporary = destination.with_suffix(".tmp")
    with image.copy() as preview:
        preview.thumbnail((edge, edge), Image.Resampling.LANCZOS)
        preview.info.clear()
        with temporary.open("wb") as stream:
            preview.save(
                stream, format="JPEG", quality=quality, subsampling=0, optimize=True, exif=b""
            )
            flush_file(stream)
    temporary.replace(destination)
