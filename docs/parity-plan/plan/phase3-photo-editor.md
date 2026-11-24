# Phase 3 plan: Photo Editor (issues #23, #24, #25)

Status: **proposed, awaiting owner approval** of the one design choice below. Spec: the three issues (owner-directed two-bar layout, Reset, default pan, aspect presets, grid, zoom).

## What exists now

`frontend/photo-editor/PhotoEditor.tsx` (494 lines) edits a `Recipe` (`rotation`, `straighten`, optional `crop` as fractions of the safe rectangle) with Mantine controls and `react-image-crop`. Rendering is already correct and worker-based (`backend/imaging/render.ts`). There is no zoom, pan, grid, level guide, undo/redo or Reset. `react-image-crop` has no zoom or pan.

## Decision needed

Replace `react-image-crop` with a small custom viewport (pointer events on one element: crop rectangle with handles, level guide, grid, default drag-to-pan, zoom). Reason: zoom, pan and tool-controlled drags all need one shared coordinate transform, and the issues ask for exactly that; bolting them onto `react-image-crop` means fighting its internal coordinates. Alternative: keep `react-image-crop` and add zoom with CSS transforms, which is smaller but makes the guide and crop mapping fragile. I recommend the custom viewport.

## Slices (each its own PR, independent review, GUI pass after each)

1. **Model, no UI change.** `frontend/photo-editor/geometry.ts`: image-to-screen transform (fit, zoom 25-400%, pan, rotation/straighten), crop math with aspect and orientation, guide-to-angle (minimum 20 source pixels, about ±35° limit, explicit errors), and a history reducer (undo, redo, reset, stale-preview guard). Unit tests only. Lowest risk, reviewable alone.
2. **#23 leveling and Reset.** Custom viewport; Level H / Level V draw guides; Reset (confirmed, whole recipe); Undo/Redo; default left-drag pan; two fixed-height bars with the final control set; tooltips and Help. Component test for stable toolbar layout. Auto-level (worker, confidence-checked) as the last commit of this slice.
3. **#24 aspect.** Apple-Photos presets, persistent W/H, orientation toggle, Clear crop.
4. **#25 grid, zoom, pan polish.** Off/Thirds/Center/Golden grid, centered zoom slider with 100% tick, wheel zoom, scrollbars.

## Working rules for this phase

- One bounded Codex attempt allowed per slice only if I pick it; otherwise built here. Independent review by a different agent at the exact SHA; I merge after APPROVED and green CI.
- Tests run on CI or one targeted file at a time locally, with a timeout and a check that nothing is left running.
- Verify mouse-to-image mapping with zoom, rotation and high-DPI by test, then on screen (Playwright run of the real app as in Phase 1).
- No change to saved recipe format without a migration note; existing drafts must still open.
