# Portfolio Studio

Portfolio Studio is the desktop editor for the website in the parent folder. `docs/architecture.md` gives the reasons behind the rules below, and `docs/testing.md` covers tests and the release checklist.

## Using the app

- The owner chooses the website folder in Settings, edits, and presses Save. The app writes files only; the owner publishes by committing and pushing in GitHub Desktop.
- After a pull or a discard in GitHub Desktop, the owner presses Reload.
- "Using the app" in `docs/architecture.md` has the steps, including adding a photo.

## Commands

Run these in `portfolio-studio/`:

- `npm ci` installs the packages. On Linux, do the one-time sandbox setup in `docs/testing.md` first.
- `npm start`, `Launch.sh`, `Launch.bat` or `Launch.command` builds and runs the app.
- `npm run typecheck` checks the app, then `backend/api/` on its own.
- `npm run format` lays out the code with Prettier. Run it before committing; `npm test` fails on unformatted files.
- `npm test` builds the app and runs the tests. On Linux, run `xvfb-run -a npm test`.
- `npm run make` builds the installer for the current OS: `.deb`, `.exe` or `.dmg`.

## Rules

- Never turn off the Electron sandbox in app code, launchers or tests, by flag, option or environment variable. Playwright's Electron launcher turns it off on Linux unless it gets `chromiumSandbox: true`. On Linux, fix a sandbox failure with the setup in `docs/testing.md`.
- The frontend imports `backend/api/` with `import type` only.
- Decode and render images only through `runJob` in `backend/imaging/jobs.ts`, never in the main thread.
- Put a package in `dependencies` only when it ships unbundled, as sharp does. Packages that Vite bundles go in `devDependencies`, because packaging copies `dependencies` into the app.
- Never edit generated files by hand: `js/photography-catalog.js`, `js/archive-photo-settings.js` and the marked regions of the website pages. Change the catalogs in `data/` and save instead.
- Keep all toolbars at fixed dimensions with stable control positions across modes, options, and validation states. Never dynamically add, remove, or resize toolbar fields when a selection changes; reserve space and use disabled states instead.
- Avoid permanent tutorial text or status banners inside editing canvases. Explain tools through the Help/manual and concise tooltips; indicate active tools through clear pressed states and accessible labels. Keep main editor controls to two rows when possible.
- Use one Mantine color scheme throughout the entire app. Expose Light, Dark, System in Settings; all surfaces, scrollbars and tooltips must use theme tokens, never panel-specific light/dark overrides. Any icon-only button requires an accessible label and a theme-aware tooltip with no open/close or transition delay.
- Crop availability is derived centrally: enable Aspect/W/H/orientation only if Crop mode is active or a crop already exists; Clear crop only with an existing crop. Keep positions fixed while disabled. Distinguish angular Undo/Redo history icons from image-rotation icons.
- The compact default editor has two toolbars and no visible More/overflow button, standalone tutorial strip, or oversized editor heading. Use icon-only Help for documentation and keyboard shortcuts. If narrow restored windows require overflow, use one responsive strategy, not per-button overrides. Right-align a content-sized OUTPUT group within the details panel.
- Do not commit or push unless asked.
- Comments are one or two sentences and say what the name and type don't, such as that `visible` shows as "Unlist", so checked means false. Obvious fields and private helpers get no comment.
- A file over about 400 lines carries a one-line reason at its top.
