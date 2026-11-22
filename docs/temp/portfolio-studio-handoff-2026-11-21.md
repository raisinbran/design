# Portfolio Studio — session handoff (2026-11-21, America/Los_Angeles)

## Source of truth and merge status

- Repository: [raisinbran/design](https://github.com/raisinbran/design); default branch: `master`.
- **Only open PR:** [#22 — new henrico app and site hotfixes](https://github.com/raisinbran/design/pull/22), branch `feat/new-henrico-app-and-site-hotfixes`. It is **open, not merged**. The last pre-handoff application commit inspected was `8cf36106df0a105c747ba6bdb1d607b20ffcb549`. This handoff is added to that **existing PR branch**; nothing is published to the live site.
- **Exact-head automated checks on `8cf3610`: PASS.** [Portfolio Studio](https://github.com/raisinbran/design/actions/runs/44984957739) passed on Ubuntu, Windows and macOS (including tests and installer packaging). [Portfolio validation #44984954023](https://github.com/raisinbran/design/actions/runs/44984954023) and [#44984957760](https://github.com/raisinbran/design/actions/runs/44984957760) passed. A documentation-only handoff commit will require treating its own head as newer; do not cite earlier checks as exact-head for it.
- **Not accepted/merged:** Independent formal PR review on the final head, native Windows/macOS UI acceptance, and website visual review remain outstanding. Automated installer success does not establish native usability.
- Read [root AGENTS.md](../../AGENTS.md), [app AGENTS.md](../../portfolio-studio/AGENTS.md), and [architecture](../../portfolio-studio/docs/architecture.md) before changes. Do not create another PR for these design/handoff updates without owner direction.

## Purpose and protected workflows

Portfolio Studio is the owner's **local** Electron/React/Mantine website administration application. It manages Photography, Engineering, Archive and the Photo Editor. Private source images remain outside the public repository; edits generate website assets and catalogs. The owner reviews changes and **alone** publishes them through GitHub Desktop (commit/push); the app never deploys, commits or pushes.

## Implemented in existing PR #22 (code, not just design)

- **Website:** Photography gallery planning enforces **no more than two photos per row** at any width, including after filtering. Adjusted Photography sticky-tag top spacing and the homepage Engineering/locomotive image framing.
- **Content management:** Photography `Arrangement` menu offers several ordering methods and reverse variants, with manual up/down movement; Engineering and Archive have manual project/collection order controls. List/detail panels have independent scroll areas; app header controls have aligned vertical centering.
- **Catalog media operations:** Rename a catalog photo and its public derivative; delete moves eligible **unshared public assets** to the OS Trash, not private originals. Added stale-revision and shared-asset protections and regression tests.
- **Photo import/export:** Name defaults without inherited source extension; suffix presets (`_crop`, `_edit`, `_fix`, `_small`, custom) and **explicit output filetype** choices `.webp (rec)`, `.jpg`, `.png`. Actual encoder, MIME and public filename must agree. **HEIC input remains supported, HEIC export was intentionally removed** because browser support is poor. Do not silently change type. Historical `DSCF4154.heic` catalog label was changed to `DSCF4154_crop.heic`, with its actual WebP asset `DSCF4154_crop.webp`; this does *not* transcode/rename the private HEIC original.
- **Appearance:** Electron Settings now exposes **Light / Dark / System**, defaults to System and persists the selection using the shared Mantine scheme. `frontend/main.tsx` sets one root theme with **zero tooltip open/close delays and zero-duration transitions**, and theme-token-based tooltip colors. Verify visual parity across every panel rather than adding per-panel color overrides.
- **Already existed (do not duplicate):** `portfolio-studio/backend/window.ts` saves/restores normal window bounds and maximized state via `electron-store`, falls back to the default **1280 × 820** window when saved geometry is off-screen. This was not invented by PR #22.

## Historical Python parity findings

- The old Python app really did have `system`, `light`, `dark` appearance settings in `tools/portfolio-studio/studio_preferences.py`, applied by `studio_theme.py` on branch `backup/pre-portfolio-studio-20261106`. Electron previously followed System but lacked a visible selector; PR #22 restores it.
- [Parity inventory](../portfolio-studio-legacy-parity-20261121.md) identifies *confirmed* gaps; it is not a comprehensive parity certification. Most importantly: batch publishing/conflict resolution, independent gallery framing versus output crop, image size/quality controls, asset reconciliation, Engineering/Archive media processing, full unsaved-preview workflows, and rollback/backup guarantees. [Issue #26](https://github.com/raisinbran/design/issues/26) requires a source-linked, feature-by-feature audit with native evidence, priorities and explicit owner waivers where appropriate.
- Earlier research missed H/V guide leveling, custom ratios and composition/inspection controls. [#23](https://github.com/raisinbran/design/issues/23), [#24](https://github.com/raisinbran/design/issues/24), [#25](https://github.com/raisinbran/design/issues/25) specify those gaps. The original owner **did not** authorize silent filetype conversion.

## Approved *future* Photo Editor — designs only, NOT running controls

The [active-Crop unified-dark concept](../ui-proposals/integrated-photo-editor.svg), [inactive/no-crop concept](../ui-proposals/integrated-photo-editor-no-crop.svg), and [Aspect-expanded concept](../ui-proposals/issue-24-crop-ratios.svg) are **static mockups**. The current `frontend/photo-editor/PhotoEditor.tsx` still uses a simple `ReactCrop` workflow with limited ratios and rotate/straighten. **Do not describe the proposed toolbar controls as implemented.**

**Layout and activation**
- **Exactly two fixed-height, nearly equal occupied-width toolbars** (≤15% difference); never dynamically resize, move, reveal or remove toolbar fields on mode change. No giant editor title and no permanent `CROP ON`/tutorial strip.
- **TOOLS:** Crop, Level H, Level V, Auto-level, distinct Rotate counterclockwise/clockwise icons, Straighten, **Undo + Redo immediately before Reset**, icon-only **Help**. Indicate active Crop with a pressed/high-contrast control, not a tutorial banner. Leveling tools and Reset are [Issue #23](https://github.com/raisinbran/design/issues/23).
- Rotation icon proposal: **circular arrow around a small picture/square**; history Undo/Redo: visibly different **angular CornerUpLeft/CornerUpRight** glyphs. Do not use nearly identical arrow pairs.
- **Reset** discards **all photo image edits** (rotation, crop, leveling/straightening and future transforms), with confirmation, but neither alters private originals nor unrelated metadata and does not publish. The narrower **Clear crop** is an **icon-only** command in the second toolbar, immediately right of orientation controls.
- **ASPECT + VIEW:** **Aspect** dropdown → narrow **W** / **H** fields → restored **Orientation** label and landscape/portrait icons → icon-only **Clear crop** → Grid dropdown → compact zoom slider (marked **100% at the mathematical midpoint**) → icon-only **Show original (hold)** eye. No separate 100%, 140%, 200% or 400% controls/readouts. No separate Pan button. Default left-mouse drag **pans** if no editing tool is selected; active crop/level tools take ownership of the drag.
- [#24](https://github.com/raisinbran/design/issues/24): Adopt the Apple Photos macOS ratio choices **Original, Freeform, Square, 16:9, 4:5, 5:7, 4:3, 3:5, 3:2, Custom**. Fields remain visible and fixed in place. Choosing `3:2` populates W=3/H=2; Portrait swaps values; manually changing either field selects **Custom**. Proportions are not pixel dimensions. No redundant aspect `Apply` or `Full photo` top-level button.
- [#25](https://github.com/raisinbran/design/issues/25): Grid overlays **Off / Thirds / Center / Golden**, default pan and bounded inspection zoom. Proposed smooth logarithmic **25%–400%** slider centered at 100%, with no overlay baked into exported pixels.

**Help, sizing, theme and output**
- Icon-only **Help** has tooltip `Help` and contains **Keyboard shortcuts** within its help/manual content—not a separate item/button. **No `More` button shown on first launch** and no default-open dropdown; all actions fit the normal launch size. If a smaller *restored* window needs overflow, use one coherent responsive policy; preserve the existing saved-window behavior.
- **All icon-only buttons** (including orientation, crop clear, photo rotation/history, Show original, Help) need descriptive accessible labels and immediate, **theme-matching** tooltips, including for disabled controls where sensible. Use shared Mantine colors for the whole app: never show a dark list with a light details pane unless that's the selected theme's consistent treatment.
- Derive disabled crop controls **centrally** from `cropModeSelected || existingCrop`. If neither: gray out **Aspect, W, H, Orientation**; keep their positions unchanged. **Clear crop** enabled only when a crop exists. Grid/zoom/Show original remain available.
- OUTPUT group keeps **Name → Suffix → Filetype → Add** ordering, uses only the width needed, is justified **right**, and stays entirely inside the photo-detail panel, never intruding into the original-photo list.

## Immediate follow-up / acceptance sequence

1. **Verify the handoff-only commit's current-head checks**; if CI is failing, determine whether a doc-specific gate or an actual source issue caused it. Do not infer current-head CI success from `8cf3610` alone.
2. Obtain a **formal independent review on PR #22's final head** after successful CI. The review must be a GitHub PR comment/review, with specific approval/rejection and reasoned assessment; do not automatically accept every QA suggestion. Then seek owner merge authorization; do not merge or publish by assumption.
3. On a **disposable website checkout** and native Windows/macOS builds, verify: Light/Dark/System restart persistence; shared list/details/tooltip theme; instant tooltips; default and restored window sizes; no unapproved publication; arrangement and locks; separate scrolling; rename/delete preserving private files; HEIC source to correctly labeled WebP/JPEG/PNG; and photo list/controls fitting the available width.
4. Check the live-site *candidate* visually at narrow/mobile and desktop widths: max **two images per row**, sticky tag spacing, and Engineering hero focal crop. Keep production `master` unchanged until reviewed/authorized.
5. Implement future editor behaviors from [#23](https://github.com/raisinbran/design/issues/23)–[#25](https://github.com/raisinbran/design/issues/25) only under further owner direction. Fix the **root shared viewport/recipe and central enabled-state model**, not per-ratio, per-photo, per-platform or per-control overrides. Complete [#26 parity matrix](https://github.com/raisinbran/design/issues/26); the current inventory still contains a now-outdated row saying Electron lacks the appearance chooser, despite #22 implementing it.
6. Reconcile the remaining legacy parity gaps with explicit owner acceptance or waivers. Follow repo standards in `AGENTS.md`, `portfolio-studio/AGENTS.md` and [henrico813/personal-dev-env](https://github.com/henrico813/personal-dev-env). Do not introduce co-author trailers or automated publication.

## Useful links

- [PR #22 description, checks and design decisions](https://github.com/raisinbran/design/pull/22)
- [Session-final Photo Editor design/appearance PR comment](https://github.com/raisinbran/design/pull/22#issuecomment-7074179380)
- [Legacy parity document](../portfolio-studio-legacy-parity-20261121.md)
- [Electron architecture](../../portfolio-studio/docs/architecture.md) and [test instructions](../../portfolio-studio/docs/testing.md)
- [Original Python implementation](https://github.com/raisinbran/design/tree/backup/pre-portfolio-studio-20261106/tools/portfolio-studio)

**Reporting convention:** clearly distinguish source-confirmed behavior, automated-check results, design proposals, native visual acceptance and owner authorization. Prefer exact commit and CI links, not generalized “ready” claims.
