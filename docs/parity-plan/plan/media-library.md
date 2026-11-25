# Plan: Media library (one place to assign files to pages)

Status: **proposed, not approved, no code written.** It needs independent review and the owner's go-ahead before any slice starts. Concept images: `docs/ui-proposals/media-library-1-section.svg`, `-2-picker.svg`, `-3-editor.svg` (hand-drawn layouts; thumbnails and names are placeholders).

## Why

Photography, Engineering and Archive each manage their own images, and the Photo Editor can only add to Photography. The owner wants one Media section where each file is assigned to pages, and each project picks from the files assigned to its page. A file assigned to two pages can show on both. Moving or duplicating a photo between pages is then just changing its page checkboxes.

## What exists today (checked against `data/` on 2026-11-24)

- 107 distinct files: Photography 29, Engineering 59 (media, covers and posters), Archive 19 (media and covers). **No file is used on two pages today.** Nothing is missing on disk.
- Photography entries name a file in `photography/thumbnails/` by bare filename; the generated site script builds the URL from that folder. Engineering and Archive store any site-relative path (`images/<Folder>/x.webp`).
- Descriptions (alt) live in each catalog entry. Photography and Archive require one; Engineering allows empty (52 of 54 Engineering media are empty now).
- Captions and credits live only in Engineering and Archive media entries. Photography has no caption.
- All catalog edits are unsaved until Save, share one undo history, and are checked for outside changes through hashed file revisions.

## Owner decisions already made

- A new `data/media-library.json` for page assignments is fine (the website never reads it).
- Description is the same on every page. Captions are per page.
- Terminology is shared: "Projects" on both pages (done in #43).
- The Photo Editor stays the tool that edits a photo; batch import and batch add come with it.

## Data model

`data/media-library.json`:

```json
{ "schemaVersion": 1,
  "items": [ { "src": "images/Caltrain/cab.webp", "alt": "cab interior",
               "pages": ["engineering", "photography"], "photoFile": "cab_crop.webp" } ] }
```

- `src` (identity): the site-relative path of the file. Videos are items too (Engineering only).
- `alt`: the one description. Required when `pages` includes photography or archive.
- `pages`: any of `photography`, `engineering`, `archive`.
- `photoFile`: the Photography catalog key, present exactly when `pages` includes photography.

**Library is part of `Catalogs`.** It is loaded, validated, hashed for outside-change detection, edited, undone and saved with the three catalogs, so Save, Reload, undo and Discard need no new mechanism. A missing file is derived in memory at load (each file used by a catalog becomes an item assigned to the page that uses it) and written on the first Save of any edit.

**Description sync.** Editing a description anywhere writes the library `alt` and every catalog use of that `src` in one edit. Catalog entries keep their `alt` field because the website reads it.

**Photography copy rule.** Photography only reads `photography/thumbnails/`. An image from `images/` assigned to Photography is copied there on Save (same bytes), a Photography entry is created, and `photoFile` links the two. Files born in the Photo Editor with Photography ticked are written to `photography/thumbnails/` and Engineering or Archive point at that path, so no copy is needed.

**Rules checked on load and Save:**

- A catalog use of a file requires its page in `pages`. In the Media section a page checkbox is disabled, with a tooltip naming where it is used, while that page still uses the file.
- Unassigned files are allowed (listed under "Unassigned") but cannot be picked anywhere.
- Library items for files that no longer exist on disk show as missing and block "Add to project".
- No folder scanning. Only the derived and explicitly added files are listed, so site chrome images in `images/` never appear.

## Screens and where they live

1. **Media** (new sidebar entry between Archive and Photo Editor; image 1). Grid of every library file with page chips, search, filters (All, one page, Unassigned) and a detail panel: description, page checkboxes, where it is used, remove. Buttons: Import files (dialog with page checkboxes) and Add from Editor.
2. **Picker** (image 2): in an Engineering or Archive project, "Add from library…" opens a dialog listing only files assigned to that page, multi-select, files already in the project dimmed. "Import files…" stays as the quick path and adds the new file to the library with this page ticked. Photography gets the same "Add from library…" for files assigned to it. Archive's "Images" heading becomes "Media" like Engineering.
3. **Photo Editor** (image 3): the draft list gets checkboxes. The Add panel becomes "Add to Media": name, description, page checkboxes (at least one), tags (when Photography is ticked). "Add this photo" and "Add selected (n)" use each photo's current edits and the default photo settings. A name already used is numbered. A photo missing a description or name is marked and skipped.

The Photo Editor's tools, two toolbars and fixed dimensions are untouched. New controls follow the AGENTS.md rules: fixed positions, disabled states for unavailable actions, accessible labels, instant tooltips.

## Slices (each its own PR, independent review, running-app check)

1. **Data and Media section.** Library schema in `Catalogs`, derive-on-load, load/save with revision hashing and tests (a save without edits changes nothing; first edit writes the file; derive reproduces today's assignments). Media screen with assignments, description sync and the disabled-checkbox rule. No file operations.
2. **Pickers.** "Add from library…" in the three pages; Import files adds to the library; Archive heading. Photography copy-on-Save for items from other folders, with rollback through `replaceFiles`.
3. **Editor to Media.** "Add to Media" and batch add; edits land in the unsaved catalogs and Save commits them, replacing the "Save or reload your edits before adding" block and the immediate save of `photos.add`. Name numbering and the existing name-conflict checks move into one pure function.
4. **Cleanup.** Remove from library with the in-use warning; retire the separate `media.import` dialogs if the picker covers them; docs (`architecture.md`, matrix rows 1, 24).

## Tests

- Unit: derive from catalogs, description sync, page-rule checks, name numbering, copy-on-Save plan.
- Storage: save into a copy of the repo and compare every file (as `testing.md` describes); failed write rolls back, including the library file.
- Running app (Playwright `_electron`, `chromiumSandbox: true`): assign, pick, unpick-blocked, batch add of three photos with real files; screenshots compared with the three concept images.

## Open points for review

1. **Photography copy rule vs making `Photo.thumbnail` a path.** The copy keeps the site script and catalog unchanged but writes one extra file per shared image. Changing `thumbnail` to a path avoids copies but touches the schema, the generator and the site script. This plan recommends the copy.
2. **Editor stops saving immediately.** Cleaner (one "edit then Save" model) but changes a flow that works. Files are written before Save, so a Discard leaves unreferenced files, as media import does today.
3. **Credit** is treated like caption (per page). Say if it should be shared like the description.
4. **Engineering descriptions** may stay empty only while the file is assigned to Engineering alone.
5. **Derive conflicts.** None exist today. If two uses ever disagree, the plan keeps the Photography text, then Archive, then Engineering, and lists the changed files before Save.

## Not in this plan

Automatic description suggestions (matrix row 13, a separate decision), folder scanning, rebuilding thumbnails, renaming files across pages.
