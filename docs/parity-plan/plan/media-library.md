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

**The description lives in the catalogs** (the site reads it there and the schema enforces it). An item may also carry an optional `alt`, only so a file that has no use yet, such as a photo added in the Editor for Engineering, has somewhere to keep its description until a project picks it. Whenever a file has a use, the catalog text wins: repair copies the first use's text into the item. One helper, `setAlt(src, alt)`, writes every use and the item in one edit, and reaches a copied Photography file through `photoFile`. A file added to a project is prefilled from the item. Engineering and Archive media `src` fields become read-only pickers.

**Ticking pages needs a description where the site does.** Photography and Archive can be ticked only once the file has a non-empty description (the Description box sits in the same panel); Engineering has no such rule. Videos cannot be ticked for Photography or Archive.

**Uses** are media `src`, project covers (`cover`) and video posters. All count as uses of the page that holds them.

**Library is part of `Catalogs`,** so load, validation, outside-change hashing, undo, Discard and Save need no new mechanism. Changes this needs in slice 1:

- `derive(catalogs)` builds the library from the catalogs: every used file, assigned to the page that uses it.
- A missing `data/media-library.json` is treated as equal to `derive(catalogs)`, with an explicit revision sentinel for the absent file. The file is written only when the library differs from what `derive` gives, so today's saves, including a Photography add, rename or delete, create nothing new. `FILES`, `readFiles`, the "not the website folder" check and the "changes no files without edits" test are updated to say so.
- On load the library is **repaired in memory**, never refused: a use whose page or item is missing is added, as derive does. Repair runs again before Save, so a typed cover or poster path never blocks a save by itself; only real schema problems are reported. A pull or an edit by another tool cannot lock the app.
- No folder scanning. Only derived and explicitly added files are listed, so site chrome images in `images/` never appear.

**In-use rule.** A page checkbox is disabled, with a tooltip naming where the file is used, while that page uses the file. "Used in" lists each use; an unused file shows "Not used yet". A file used twice in one project lists both.

## Photography and shared files

Photography only reads `photography/thumbnails/`, so a file from `images/` assigned to Photography needs a copy there. The copy is made **when the owner ticks Photography**, like `media.import` writes at import: one backend call writes the file under a free name (`name`, then `name-2`, …), reads width and height and hashes the bytes through `runJob`, and returns `thumbnail`, `thumbnailVersion`, `thumbnailWidth` and `thumbnailHeight`. The Photography entry is then an ordinary unsaved catalog edit, and Save only commits catalogs. A Discard leaves at most an unreferenced file, as import does today. There is no rollback code to add.

A copied file means two files for one item. The Photography entry is reached through `photoFile`; the Engineering and Archive uses point at `src`. **Edit Image** changes only the Photography file, and the Media detail panel says so for such an item.

Engineering and Archive can point at any `photography/thumbnails/` file, so a photo born in the Photo Editor with Photography ticked needs no copy for them. **Where a photo is written:** into `photography/thumbnails/` when Photography is ticked (as today), otherwise into `images/Library/`. A photo that is not on Photography has no Edit Image, since Edit Image belongs to a Photography entry; to change it, import the original again.

**Rename, delete and library removal** are **refused while another page uses the file**, with a message naming the use, the same rule as the disabled checkbox. This lands in slice 1, together with the live checkboxes, so no slice leaves a window where a shared file can be trashed.

**Edit Image** on a photo also shown on other pages changes that one file for all of them. Engineering and Archive paths carry no version, so the site may show a cached old image until the browser refreshes; that is noted in the Edit Image message and not solved here.

## Screens and where they live

1. **Media** (new sidebar entry between Archive and Photo Editor; image 1). Grid of every library file with page chips, search, filters (All, one page, Unassigned) and a detail panel: description, page checkboxes, where it is used, remove. Buttons: Import files (dialog with page checkboxes) and Add from Editor.
2. **Picker** (image 2): in an Engineering or Archive project, "Add from library…" lists only files assigned to that page, multi-select, files already in the project dimmed. Photography gets the same picker. "Import files…" stays as the quick path and registers its files in the library with this page ticked. Archive's "Images" heading becomes "Media" like Engineering.
3. **Photo Editor** (image 3): draft checkboxes select photos; the two toolbars and every existing control are untouched. The panel is titled "Add to Media" and gets page checkboxes (at least one) and Tags only when Photography is ticked. Ticking Engineering or Archive only assigns the file; the project picks it later with "Add from library…". There is no project choice in the panel. "Add this photo" and "Add selected (n)" use each photo's current edits and the default photo settings. A name already in use is numbered. A photo missing a name or description is marked and skipped.

New controls follow `portfolio-studio/AGENTS.md`: fixed positions, disabled states instead of added or removed fields, accessible labels, instant tooltips, no standing tutorial text (explanations go to Help and tooltips).

## The Photo Editor keeps its immediate save

`photos.add` stays the one save: it takes the render held for that photo, and the "Save or reload your edits before adding" guard stays. `AddRequest` gains `pages`. For Photography it writes the thumbnail and the entry as today. In every case it also adds the library item (pages, `photoFile`, description) in the same `savePortfolio`; it never creates a project media entry. Batch add loops that call per selected photo. Nothing new is held between add and Save, so Edit Image cannot leave new bytes with an old `thumbnailVersion`, and drafts are dropped only after a successful add.

## Slices (each its own PR, independent review, running-app check)

1. **Library data and Media screen.** Schema in `Catalogs`, derive, sentinel and repair rules, tests, the Media screen with assignments, the description and in-use rules, and the rename, delete and removal refusals. Page picking is not wired yet, which the PR description says.
2. **Engineering and Archive pickers,** read-only media `src` pickers, `setAlt`, and `media.import` registering its files in the library.
3. **Photography picker and copy** at tick time.
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
