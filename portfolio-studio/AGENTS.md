# Portfolio Studio

Portfolio Studio is the desktop editor for the website in the parent folder. `docs/architecture.md` gives the reasons behind the rules below, and `docs/testing.md` covers tests and the release checklist.

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
- Do not commit or push unless asked.
- Comments are one or two sentences and say what the name and type don't, such as that `visible` shows as "Unlist", so checked means false. Obvious fields and private helpers get no comment.
- A file over about 400 lines carries a one-line reason at its top.
