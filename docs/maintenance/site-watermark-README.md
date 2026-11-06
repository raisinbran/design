# Site-wide corner watermark batch

This branch performs a one-time update of JPEGs referenced by the live Home,
Engineering and Design pages (including homepage rotating previews and video
posters). The Photography page and unreferenced image archive are excluded.

- Uses `processor.watermark(..., tile_alpha=0)`, the existing Portfolio
  Studio corner-only watermark algorithm, with the same transparent outline
  grape selection as New Photos Processor.
- Keeps aspect ratios and limits every processed image to 1080 pixels on its
  longest side **except** `assets/homepage-2026/hero-guideway.jpg`,
  `assets/homepage-2026/engineering-field.jpg` and
  `images/Creative/The Cost v.1.0_th.jpg` (Design > Art accordion).
  All three still receive the corner watermark.
- Leaves existing filenames, paths, page code, logos, GIFs, PNGs and videos
  unchanged. Writes JPEGs using Portfolio Studio's standard 90-quality
  progressive encoding and rights metadata.
- Creates `docs/maintenance/site-watermark-20261031.json` recording before
  and after dimensions, SHA-256 fingerprints and resize exceptions. Re-runs
  skip files already recorded; modified recorded files fail safely.

The branch-only GitHub Actions job uses Windows to match Portfolio Studio's
Windows Segoe UI watermark font. This branch is **not** a publication.

**Before merging:** visually inspect the corner signatures (especially
high-contrast drawings, small images, the two homepage hero images and the
Art accordion image), confirm the 1080px cap and three exceptions from the
manifest, and verify Home/Engineering/Design load normally. The script cannot
reliably detect an existing unrecorded, pixel-baked watermark, so review
any potentially pre-watermarked legacy images for double signatures.
