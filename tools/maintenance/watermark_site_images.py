"""Watermark active non-Photography site images using Portfolio Studio's processor.

Run in a clean working tree. Only JPEGs referenced by the live site are modified.
The manifest prevents accidental double-watermarking if the job is rerun.
"""
from __future__ import annotations

import hashlib
import html
import io
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote

from PIL import Image, ImageChops, ImageOps

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "portfolio-studio"))
from export_rights import export_exif, jpeg_with_rights  # noqa: E402
from processor import watermark  # noqa: E402

SOURCE_FILES = (
    "index.html",
    "engineeringdesign.html",
    "creativedesign.html",
    "js/home.js",
)
# These stay at their current dimensions, but receive the corner watermark.
SIZE_EXCEPTIONS = {
    "assets/homepage-2026/hero-guideway.jpg",
    "assets/homepage-2026/engineering-field.jpg",
    "images/Creative/The Cost v.1.0_th.jpg",
}
MANIFEST = ROOT / "docs" / "maintenance" / "site-watermark-20261031.json"
IMAGE_URL = re.compile(
    r"""(?:images|assets/homepage-2026)/[^"'<>\r\n]*?\.(?:jpe?g|png|webp)""",
    re.IGNORECASE,
)
MAX_SIDE = 1080
QUALITY = 90


def file_hash(data: bytes) -> str:
    """Stable content fingerprint used to guard against repeat processing."""
    return hashlib.sha256(data).hexdigest()


def referenced_jpegs() -> list[str]:
    """Collect live page images and scripted homepage preview candidates."""
    found = set()
    for source_name in SOURCE_FILES:
        content = html.unescape((ROOT / source_name).read_text(encoding="utf-8"))
        for match in IMAGE_URL.finditer(content):
            relative = unquote(match.group(0))
            path = Path(relative)
            if path.suffix.lower() not in {".jpg", ".jpeg"}:
                continue  # Never watermark logos, icons, PNGs or WebP thumbnails.
            if path.is_absolute() or ".." in path.parts:
                raise ValueError(f"Unsafe image path: {relative}")
            if not (ROOT / path).is_file():
                raise FileNotFoundError(f"Referenced image missing: {relative}")
            found.add(path.as_posix())
    if not SIZE_EXCEPTIONS.issubset(found):
        raise RuntimeError("A protected resize exception is no longer on a live page")
    if len(found) < 50:
        raise RuntimeError(f"Unexpectedly few referenced JPEGs: {len(found)}")
    return sorted(found)


def outline_logo() -> Path | None:
    """Use the same alpha-coverage selection as New Photos Processor."""
    candidates = (
        ROOT / "assets/homepage-2026/grape-hover.png",
        ROOT / "assets/homepage-2026/grape-default.png",
    )
    ranked = []
    for candidate in candidates:
        if not candidate.is_file():
            continue
        with Image.open(candidate) as source:
            alpha = source.convert("RGBA").getchannel("A")
            bounds = alpha.getbbox()
            if bounds:
                alpha = alpha.crop(bounds).resize((64, 64))
                coverage = sum(alpha.histogram()[97:]) / 4096
                ranked.append((coverage, candidate))
    if not ranked:
        return None
    ranked.sort(key=lambda item: item[0])
    return ranked[0][1] if ranked[0][0] < 0.70 else None


def process_image(relative: str, logo: Path | None) -> dict:
    """Resize first, then render only the exact Portfolio Studio corner mark."""
    path = ROOT / relative
    before = path.read_bytes()
    with Image.open(io.BytesIO(before)) as source:
        existing_software = str(source.getexif().get(305, ""))
        original_dimensions = list(ImageOps.exif_transpose(source).size)
        # New Photos Processor stamps its Software EXIF field on completed exports.
        if "Portfolio Studio" in existing_software:
            return {
                "status": "already-processed",
                "sha256": file_hash(before),
                "dimensions": original_dimensions,
            }
        image = ImageOps.exif_transpose(source).convert("RGB")

    if relative not in SIZE_EXCEPTIONS and max(image.size) > MAX_SIDE:
        image.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)

    processed = watermark(image, logo=logo, tile_alpha=0)
    # Verify actual changed pixels in the corner, not just a successful encode.
    width, height = processed.size
    bottom_right = (int(width * 0.5), int(height * 0.7), width, height)
    if ImageChops.difference(
        image.crop(bottom_right), processed.crop(bottom_right)
    ).getbbox() is None:
        raise RuntimeError(f"No visible corner watermark applied: {relative}")

    output = io.BytesIO()
    processed.save(
        output,
        "JPEG",
        quality=QUALITY,
        subsampling=0,
        optimize=True,
        progressive=True,
        exif=export_exif(),
    )
    encoded = jpeg_with_rights(output.getvalue())
    with Image.open(io.BytesIO(encoded)) as check:
        check.load()
        if check.size != processed.size:
            raise RuntimeError(f"Image dimensions changed during encoding: {relative}")
        if relative not in SIZE_EXCEPTIONS and max(check.size) > MAX_SIDE:
            raise RuntimeError(f"Image exceeds size limit: {relative}")
        if relative in SIZE_EXCEPTIONS and list(check.size) != original_dimensions:
            raise RuntimeError(f"Resize-exempt image dimensions changed: {relative}")

    path.write_bytes(encoded)
    return {
        "status": "watermarked",
        "source_sha256": file_hash(before),
        "sha256": file_hash(encoded),
        "original_dimensions": original_dimensions,
        "dimensions": list(processed.size),
        "resize_exempt": relative in SIZE_EXCEPTIONS,
    }


def main() -> None:
    candidates = referenced_jpegs()
    previous = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    entries = previous.get("images", {})
    if not isinstance(entries, dict):
        raise ValueError("Invalid previous processing manifest")
    logo = outline_logo()
    if logo is None:
        raise RuntimeError("Portfolio Studio's transparent outline logo is unavailable")

    # Reject unexpected changes to previously processed files rather than
    # silently adding a second watermark to an edited publication copy.
    for relative in candidates:
        if relative in entries:
            current_sha = file_hash((ROOT / relative).read_bytes())
            if current_sha != entries[relative]["sha256"]:
                raise RuntimeError(f"Previously processed image changed: {relative}")

    count = 0
    for relative in candidates:
        if relative in entries:
            continue
        entries[relative] = process_image(relative, logo)
        count += entries[relative]["status"] == "watermarked"
        print(f"{entries[relative]['status']}: {relative}", flush=True)

    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(
        json.dumps(
            {
                "description": "Live non-Photography images; watermark from Portfolio Studio, corner-only",
                "max_side": MAX_SIDE,
                "exceptions": sorted(SIZE_EXCEPTIONS),
                "images": dict(sorted(entries.items())),
            },
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )
    print(f"Processed {count} JPEGs; inventory contains {len(candidates)} live JPEGs.")


if __name__ == "__main__":
    main()
