# Plan: Media library (one place to assign files to pages)

Status: **revision 2, proposed, not approved, no code written.** Revision 1 was rejected in independent review; each point is answered below. It needs re-review and the owner's go-ahead before any slice starts. Concept images: `docs/ui-proposals/media-library-1-section.svg`, `-2-picker.svg`, `-3-editor.svg` (hand-drawn layouts; thumbnails and names are placeholders).

## Why

Photography, Engineering and Archive each manage their own images, and the Photo Editor can only add to Photography. The owner wants one Media section where each file is assigned to pages, and each project picks from the files assigned to its page. A file assigned to two pages can show on both. Moving or duplicating a photo between pages is then just changing its page checkboxes.

## What exists today (checked against `data/` on 2026-11-24)

- 107 distinct files: Photography 29, Engineering 59 (media, covers and posters), Archive 19 (media and covers). **No file is used on two pages today.** None is missing on disk.
- Photography entries name a file in `photography/thumbnails/` by bare filename; `js/photography.js` builds the URL from that folder. One photo (`R0000753_crop.jpg`) has no thumbnail and is served from `photography/published/`. Engineering and Archive store any site-relative path.
- Descriptions (alt) live in each catalog entry. Photography and Archive require one; Engineering allows empty (46 of 48 Engineering images are empty now). Covers and posters carry no alt.
- Captions and credits live only in Engineering and Archive media entries.
- Catalog edits are unsaved until Save, share one undo history, and are checked for outside changes through hashed file revisions. Photography add, rename and delete are immediate disk operations (`add.ts`, `manage.ts`).

## Owner decisions already made

- A new `data/media-library.json` for page assignments is fine (the website never reads it).
- Description is the same on every page. Captions are per page.
- Terminology is shared: "Projects" on both pages (done in #43).
- The Photo Editor stays the tool that edits a photo; batch import and batch add come with it.

## Data model

`data/media-library.json` holds only assignments:

```json
{ "schemaVersion": 1,
  "items": [ { "src": "images/Caltrain/cab.webp", "pages": ["engineering", "photography"],
               "photoFile": "cab_crop.webp" } ] }
```

- `src` is the identity: the site-relative path of the file, including videos (Engineering only). For a Photography photo it is `photography/thumbnails/<thumbnail>`, or `photography/published/<file>` for a photo with no thumbnail.
- `pages` is any of `photography`, `engineering`, `archive`.
- `photoFile` is the Photography catalog key, present exactly when `pages` includes photography.

**The description stays in the catalogs** (the site reads it there and the schema enforces it). One helper, `setAlt(src, alt)`, updates every use of a file in one edit. A file added to a project is prefilled from any existing use. The Media screen shows the description of the first use. Engineering and Archive `src` fields become read-only pickers, so a retyped path cannot leave the library.

**Uses** are media `src`, project covers (`cover`) and video posters. All count as uses of the page that holds them.

**Library is part of `Catalogs`,** so load, validation, outside-change hashing, undo, Discard and Save need no new mechanism. Changes this needs in slice 1:

- `derive(catalogs)` builds the library from the catalogs: every used file, assigned to the page that uses it.
- A missing `data/media-library.json` is treated as equal to `derive(catalogs)`, with an explicit revision sentinel for the absent file. The file is written only when the library differs from what `derive` gives, so today's saves, including a Photography add, rename or delete, create nothing new. `FILES`, `readFiles`, the "not the website folder" check and the "changes no files without edits" test are updated to say so.
- On load the library is **repaired in memory**, never refused: a use whose page or item is missing is added, as derive does. Problems are reported on Save only, so a pull or an edit by another tool cannot lock the app.
- No folder scanning. Only derived and explicitly added files are listed, so site chrome images in `images/` never appear.

**In-use rule.** A page checkbox is disabled, with a tooltip naming where the file is used, while that page uses the file. "Used in" lists each use; an unused file shows "Not used yet". A file used twice in one project lists both.

## Photography and shared files

Photography only reads `photography/thumbnails/`, so a file from `images/` assigned to Photography needs a copy there. The copy is made **when the owner ticks Photography**, like `media.import` writes at import: one backend call writes the file under a free name (`name`, then `name-2`, …), reads width and height and hashes the bytes through `runJob`, and returns `thumbnail`, `thumbnailVersion`, `thumbnailWidth` and `thumbnailHeight`. The Photography entry is then an ordinary unsaved catalog edit, and Save only commits catalogs. A Discard leaves at most an unreferenced file, as import does today. There is no rollback code to add.

Engineering and Archive can point at any `photography/thumbnails/` file, so a photo born in the Photo Editor needs no copy for them.

**Rename and delete** in Photography are **refused while another page uses the file**, with a message naming the use, the same rule as the disabled checkbox. Removing a file from the library is refused the same way.

**Edit Image** on a shared photo changes the one file for every page that uses it, and says so in its confirmation. Engineering and Archive paths carry no version, so the site may show a cached old image until the browser refreshes; that is noted in the Edit Image message and not solved here.

## Screens and where they live

1. **Media** (new sidebar entry between Archive and Photo Editor; image 1). Grid of every library file with page chips, search, filters (All, one page, Unassigned) and a detail panel: description, page checkboxes, where it is used, remove. Buttons: Import files (dialog with page checkboxes) and Add from Editor.
2. **Picker** (image 2): in an Engineering or Archive project, "Add from library…" lists only files assigned to that page, multi-select, files already in the project dimmed. Photography gets the same picker. "Import files…" stays as the quick path and registers its files in the library with this page ticked. Archive's "Images" heading becomes "Media" like Engineering.
3. **Photo Editor** (image 3): draft checkboxes select photos; the two toolbars and every existing control are untouched. The Add panel gets page checkboxes (at least one) and Tags only when Photography is ticked. "Add this photo" and "Add selected (n)" use each photo's current edits and the default photo settings. A name already in use is numbered. A photo missing a name or description is marked and skipped.

New controls follow `portfolio-studio/AGENTS.md`: fixed positions, disabled states instead of added or removed fields, accessible labels, instant tooltips, no standing tutorial text (explanations go to Help and tooltips).

## The Photo Editor keeps its immediate save

`photos.add` stays the one save: it takes the render held for that photo, and the "Save or reload your edits before adding" guard stays. `AddRequest` gains `pages`. For Photography it writes the thumbnail and the entry as today. For Engineering or Archive it also adds the media entry and the library item in the same `savePortfolio`. Batch add loops that call per selected photo. Nothing new is held between add and Save, so Edit Image cannot leave new bytes with an old `thumbnailVersion`, and drafts are dropped only after a successful add.

## Slices (each its own PR, independent review, running-app check)

1. **Library data and Media screen.** Schema in `Catalogs`, derive, sentinel and repair rules, tests, and the Media screen with assignments and the in-use rule (checkboxes of unused files are live; page picking is not wired yet, which this slice says in its description).
2. **Engineering and Archive pickers,** read-only `src` pickers, `setAlt`, and `media.import` registering its files in the library.
3. **Photography picker and copy,** with the rename, delete and remove refusals.
4. **Photo Editor add with pages and batch,** then docs (`architecture.md`, matrix rows 1 and 24).

## Tests

- Unit: derive, repair, `setAlt`, page rules, name numbering.
- Storage: save into a copy of the repo and compare every file; a no-edit save changes nothing; the first library change writes the file; the copy writes the three Photography fields.
- Running app (Playwright `_electron`, `chromiumSandbox: true`): assign, pick, blocked unpick, a batch add of three real photos; screenshots against the concept images.

## Open points for the owner

1. **Photography copy** (one extra file when a non-Photography image is also shown in Photography) versus changing the catalog to store paths, which touches the generator and the site script. This plan recommends the copy.
2. **Credit** is treated like caption (per page).
3. **Engineering descriptions** may stay empty while the file is assigned to Engineering alone.

## Not in this plan

Automatic description suggestions (matrix row 13, a separate decision), folder scanning, rebuilding thumbnails, renaming files across pages, cache-busting for Engineering and Archive paths.
