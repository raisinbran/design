# Plan: Media library (one place to assign files to pages)

Status: **approved by the owner with the comments below; slices 1 to 4 are merged; installers are next.** Revision 1 was rejected in independent review; each point is answered below. Concept images: `docs/ui-proposals/media-library-1-section.svg`, `-2-picker.svg`, `-3-editor.svg` (hand-drawn layouts; thumbnails and names are placeholders).

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

- `src` is the identity: the site-relative path of the file, including videos (Engineering only). For a Photography photo it is `photography/thumbnails/<thumbnail>`, the path itself when `thumbnail` contains `/`, or `photography/published/<file>` for a photo with no thumbnail.
- `pages` is any of `photography`, `engineering`, `archive`.
- `photoFile` is the Photography catalog key, present exactly when `pages` includes photography.

**The description lives in the catalogs** (the site reads it there and the schema enforces it). An item carries an `alt` **only while the file has no use**, such as a photo added in the Editor for Engineering, so it has somewhere to keep its description until a project picks it. When the file gains a use, the item's `alt` is dropped and the catalog text is the only copy, so a description edit never rewrites the library file. One helper, `setAlt(src, alt)`, writes every use (or the item, when there is none) in one edit, and reaches the Photography entry through `photoFile`. A file added to a project is prefilled from the item. Engineering and Archive media `src` fields become read-only pickers.

**Ticking pages needs a description where the site does.** Photography and Archive can be ticked only once the file has a non-empty description (the Description box sits in the same panel); Engineering has no such rule. Videos cannot be ticked for Photography or Archive.

**Uses** are media `src`, project covers (`cover`) and video posters. All count as uses of the page that holds them.

**Library is part of `Catalogs`,** so load, validation, outside-change hashing, undo, Discard and Save need no new mechanism. Changes this needs in slice 1:

- `derive(catalogs)` builds the library from the catalogs: every used file, assigned to the page that uses it.
- A missing `data/media-library.json` is treated as equal to `derive(catalogs)`, with an explicit revision sentinel for the absent file. The file is written only when the library differs from what `derive` gives, so today's saves, including a Photography add, rename or delete, create nothing new. `FILES`, `readFiles`, the "not the website folder" check and the "changes no files without edits" test are updated to say so.
- On load the library is **repaired in memory**, never refused: a use whose page or item is missing is added, as derive does. Repair runs again before Save, so a typed cover or poster path never blocks a save by itself; only real schema problems are reported. A pull or an edit by another tool cannot lock the app.
- No folder scanning. Only derived and explicitly added files are listed, so site chrome images in `images/` never appear.

**In-use rule.** A page checkbox is disabled, with a tooltip naming where the file is used, while that page uses the file. "Used in" lists each use, a Photography use with its path; an unused file shows "Not used yet". A file used twice in one project lists both.

## One file, referenced by path (replaces the copy rule)

Revision 3 copied a file into `photography/thumbnails/` when it was also shown on Photography. That makes two files for one photo, and Edit Image would change only one of them. The owner asked for a path-based design, so **a file lives in one place and every page points at it.**

- **Photography entries may hold a path.** `Photo.thumbnail` stays a bare filename for the existing 29 photos (meaning `photography/thumbnails/<name>`, so no data changes). A value containing `/` is a site-relative path, such as `images/Library/cab.webp`. `js/photography.js` and `js/home.js` build the URL with one small rule (a value with `/` is used as given, encoded per segment), and the generated catalog script passes the value through. Every place that builds `photography/thumbnails/<name>` learns the same rule: `schema.ts`, `add.ts` (conflict check and write), `manage.ts`, `photos.appearance` in `backend/imaging/photos.ts`, `PhotographyView.tsx`, `published-image.ts`, `js/photography.js` and `js/home.js`. This is the larger change and is slice 3.
- **Path validation.** A `thumbnail` value is either a bare filename or a site-relative path under `images/`, with no leading `/`, no `..` segment and no scheme. The schema rejects anything else.
- **Rename and delete of a path entry.** Rename happens in Media only (it repoints every use). Deleting a Photography photo whose `thumbnail` is a path removes the entry and leaves the library file alone; the file is trashed only by removing it from the library, which the in-use rule already guards.
- **No copies, no copy step.** Ticking Photography on a file creates a Photography entry that points at the file's path, with its width, height and version read through `runJob` from the file already on disk, plus `file`, `alt`, `tags`, `visible: true` and `displayPriority: "normal"`.
- **Where new files go.** A photo added for Photography alone keeps going to `photography/thumbnails/` as today. A photo added for any other page, or imported in Media, goes to `images/Library/`. Either way it is one file with one library item, and `photoFile` links the Photography entry.
- **Edit Image on a file other pages also use** writes the new image under a new name and repoints every use in the same save, so no page shows a cached old image (Engineering and Archive paths carry no version). The old file goes to Trash once nothing references it. A file used only by Photography keeps today's behavior (same name, new `thumbnailVersion`).
- **Rename, delete and library removal** are **refused while another page uses the file**, with a message naming the use, the same rule as the disabled checkbox. This lands in slice 1 with the live checkboxes, so no slice leaves a window where a shared file can be trashed.
- A photo that is not on Photography has no Edit Image; import the original again to change it.

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
3. **Photography picker and path-based thumbnails:** the `Photo.thumbnail` path rule and validation in the files listed above, then the new-name Edit Image for shared files (a Photography picker was dropped; Media assigns photos). `savePortfolio`'s image check accepted only `photography/thumbnails/` and `photography/published/` paths; this slice widened it to site paths directly inside a folder under `images/`; new photos are written to `images/Photography/`.
4. **Photo Editor add with pages and batch.** Merged, with the docs (`portfolio-studio/docs/architecture.md`, matrix rows 1 and 24).

## Tests

- Unit: derive, repair, `setAlt`, page rules, name numbering.
- Storage: save into a copy of the repo and compare every file; a no-edit save changes nothing; the first library change writes the file; ticking Photography on a shared file creates a complete entry from the file already on disk; Edit Image on a shared file repoints every use.
- Running app (Playwright `_electron`, `chromiumSandbox: true`): assign, pick, blocked unpick, a batch add of three real photos; screenshots against the concept images.

## Open points for the owner

1. **Credit** is the small source line shown with an image's caption in Engineering and Archive (for example "American Axle & Manufacturing", "2015. Charcoal"). The plan keeps it per page like the caption. Photography has none.
2. **Descriptions are the images' alt text.** The owner wants them generated from the photo's contents. That is a separate feature (matrix row 13): the plan only reserves the field and shows it in the Add panel and the Media detail panel for now. See the note in the PR.
3. **Media and Photo Editor as one tab.** Discussed in the PR; not part of slices 1 to 4.

## Not in this plan

Automatic description suggestions (matrix row 13, a separate decision), folder scanning, rebuilding thumbnails, renaming files across pages, cache-busting for Engineering and Archive paths.

## Owner comments after tentative approval

- **No `thumbnails` folder.** The site no longer has separate thumbnail and full-size versions, so the name is a misnomer. The plan should end with every Photography image in one plain folder (path to be chosen when slice 3 is written, with a migration that moves the 29 files, rewrites `thumbnail` values and drops the field name's folder assumption). Until slice 3 lands, new photos keep the current folder and the reader rule above covers both.
- **Credit stays a separate line.** Caption and Credit are both optional, and neither is carried to other pages when a photo is used elsewhere.
- **Version.** The owner first chose 2.x.x because the Python app was version 1, then changed it to 1.0.0: the Python app was used for a couple of days and fully replaced, so this is the first real version.
- **Platforms.** The owner has no Linux machine, so Linux builds are not tested by hand.
- **Description suggestions** (matrix row 13): a few plain words per photo, accuracy not critical, easy to set up on any PC; a small local model bundled with the app is preferred if it adds no setup.
