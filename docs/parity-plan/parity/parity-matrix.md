# Python to Electron parity matrix (draft, 2026-11-23)

Status: **proposal only. Nothing here is a decision.** Owner marks each "Proposed" cell Build, Waive or Later. Some Python features may be obsolete, since that app was drafted weeks ago.

**Basis and limits.** Python side: the 46 non-test modules on `origin/backup/pre-portfolio-studio-20261106` (`tools/portfolio-studio/`), read as module purpose, function inventory and UI labels in `photo_studio.py`; not every line. Electron side: `master` plus PR #22's head (`17183f4c`), checked by source search, not by running the app. Rows marked **verify** need a line-level read or a GUI check before they count. This feeds issue #26; it does not replace its source-anchored audit.

Status key: **Done**, **Partial**, **Missing**, **N/A** (Tk or Python-internal, no equivalent needed), **Verify**.

## A. Photography workflow

| # | Python feature (module) | Electron status | Proposed |
| --- | --- | --- | --- |
| 1 | Import originals; batch select current/highlighted/all, staged multi-photo publish with conflict numbering (`photo_studio`) | **Missing**: one photo at a time; conflict = overwrite/cancel prompt | Decide: Build batch, or Waive if owner imports one at a time |
| 2 | Filename suffix presets `_crop _edit _fix _small`, custom (`photo_studio`) | **Done** (PR #22) | Done |
| 3 | JPEG quality 80/85/90/95; max side presets, "change default" (`photo_studio`, `processor`) | **Partial**: fixed 800 px, fixed quality per codec | Build quality/size controls if the site needs more than 800 px |
| 4 | Publish full-size JPEG plus separately framed WebP thumbnail (`processor`, `gallery_thumbnails`) | **Missing**: one derivative; format is now owner-selectable | Decide: the single-derivative model may be an intentional simplification |
| 5 | Gallery framing vs "Crop exported JPEG" destinations (`photo_studio`, `edit_tags`) | **Missing**: crop always changes published pixels | Decide: depends on row 4 |
| 6 | Crop with free/original/preset ratios, custom W:H, handles, draw/move rectangle (`photo_viewport`) | **Partial**: Free, 1:1, 4:5, 3:2 only (issue #24) | Build (approved Apple Photos presets) |
| 7 | Level H / Level V guide lines, Auto-level, rotate CCW/CW, rotation undo (`photo_studio`, `processor`) | **Partial**: rotate and a Straighten slider; no guides or auto-level (issue #23) | Build (owner replaced "Undo rotation" with Reset and Undo/Redo) |
| 8 | Composition grid Off/Thirds/Center/Golden (`photo_viewport`) | **Missing** (issue #25) | Build |
| 9 | Zoom presets and slider, pan, wheel zoom, scrollbars (`photo_viewport`) | **Missing** (issue #25) | Build (approved compact design) |
| 10 | "Full photo" crop reset; Reset selected / reset all unsaved (`photo_studio`, `edit_tags`) | **Missing** (#23 Reset); app-level undo/redo exists | Build |
| 11 | Pre-publish preview of the encoded export, scope/names/size/overwrite (`export_preview`) | **Partial**: render preview and output path shown | Verify |
| 12 | Watermark (grape logo plus text), supersampled; opt-out rights metadata in EXIF/XMP, no GPS (`processor`, `export_rights`, `publication_metadata`) | **Done**, with tests | Done |
| 13 | Accessible description, local ML caption suggestion with "Reviewed" check (`offline_descriptions`, `setup_offline_descriptions`, `photo_studio`) | **Missing**: manual alt text only; no "reviewed" flag | Likely Waive or Later: model download and a native ML dependency |
| 14 | Tags with checkboxes, per-photo prominence/priority, visibility (`photo_studio`, `edit_tags`) | **Done** (priority, tags, lock, unlist) | Verify the prominence labels |
| 15 | "Open after publishing", save "open after" preference (`photo_studio`) | **Missing** (no publish step; app saves only) | Waive: the owner publishes in GitHub Desktop |
| 16 | HEIC input, EXIF orientation, rotated-HEIF handling | **Done**, tested | Done |
| 17 | Private registry of each photo's original file path and checksum; relink moved originals (`gallery_thumbnails`) | **Partial**: drafts store, Relink; no checksum registry | Verify, then Decide |
| 18 | Rebuild all thumbnails from originals, with progress (`gallery_thumbnails.build_thumbnails`) | **Missing** | Decide: needed only if thumbnail rules change |
| 19 | Add pre-existing unlisted published files; reconcile missing assets; match renamed files (`manage_published`) | **Missing** | Build if the owner renames or adds files outside the app |
| 20 | Remove: unlist only, archive JPEGs to backup, or send to Trash; Windows Recycle Bin via IFileOperation (`manage_published`, `recycle_bin`) | **Partial**: unlist, delete to Trash; no backup-archive option | Decide: Trash may be enough |
| 21 | Backfill rights metadata into already-published JPEGs; dry run default, backups outside Git (`update_published_rights`) | **Missing** | Likely Waive: one-time maintenance, tied to the old JPEG pipeline; confirm all live images already carry rights |
| 22 | Photography arrangement: four strategies, reverse, manual move, lock (`arrange_gallery`) | **Done** (PR #22) | Done; GUI check pending |

## B. Engineering and Archive

| # | Python feature | Electron status | Proposed |
| --- | --- | --- | --- |
| 23 | Engineering: add, duplicate, remove, reorder, undo; rich-text body preserving legacy markup (`engineering_editor`, `rich_text`) | **Done** (Tiptap, sanitizer); duplicate: **Verify** | Verify |
| 24 | Engineering/Archive media: import local image or video, optimize, add/remove/reorder, choose cover (`*_editor`) | **Missing**: paths typed by hand | Build (likely the biggest daily-use gap) |
| 25 | Video still-frame preview (`video_preview`) | **Missing** | Later |
| 26 | Unsaved-draft preview with asset overrides (`engineering_editor.preview`, `archive_editor.preview`) | **Partial**: Preview opens saved page only | Decide |
| 27 | Archive collections: metadata, crop/prominence/focus settings, migrate legacy HTML (`archive_catalog`, `archive_writer`) | **Done**/**Partial**: crop mode exists; **Verify** prominence and focus | Verify |
| 28 | Safe write: never delete source media; validate local assets (`*_writer`, `*_catalog`) | **Done** in schema and save path | Done |

## C. Platform, safety, shell

| # | Python feature | Electron status | Proposed |
| --- | --- | --- | --- |
| 29 | Atomic multi-file save with backup rollback, stale-write rejection (`edit_tags.atomic_catalog_pair`, `gallery_thumbnails.asset_transaction`) | **Partial**: temp files then renames; stale-write rejection done; no rollback after a mid-rename failure | Build (audit finding 8) |
| 30 | Light/Dark/System appearance, native title bar tint (`studio_theme`, `studio_preferences`) | **Partial**: scheme restored in PR #22; title bar **Verify** | Verify on both OSes |
| 31 | Window size/maximized memory, off-screen recovery (`window_state`) | **Done** (`backend/window.ts`); multi-monitor **Verify** | Verify |
| 32 | About window: versions, export documentation (`studio_about`, `studio_info`) | **Partial**: versions in Settings; no about/docs page | Build small or Waive |
| 33 | Soft sound notifications with volume preview (`studio_notifications`) | **Missing** | Likely Waive |
| 34 | Preferences stored outside the repo (`studio_preferences`) | **Done** (electron-store) | Done |
| 35 | HiDPI scaling, Windows scrollbar and slider widgets, responsive toolbar overflow, thumbnail list, workspace tabs, editor tabs (`modern_*`, `responsive_toolbar`, `thumbnail_*`, `workspace_tabs_ui`, `editor_tabs`) | **N/A**: Tk-specific; Mantine/CSS replace them | N/A |
| 36 | Launchers and packaging: Python venv, `package_macos_launcher`, `verify_macos`, `requirements.txt` | **N/A**: Electron Forge, installers | N/A |
| 37 | Python test suite (102 tests on Windows, 6 modules) | **Not ported** | Cover the behaviors above by test as each row is built, not by translation |

## Reading the matrix

- Daily-use gaps by my reading: 24 (media import), 6-10 (editor, owner already specified), 29 (rollback). Rows 1, 4, 5 are one decision: does the new app keep the "one JPEG plus WebP thumbnail, batch" pipeline, or the simpler single-derivative one it has now?
- Waive candidates (13, 15, 21, 33) are obsolete or low value in my view. Owner decides.
- First action before building anything: owner marks the Proposed column.
