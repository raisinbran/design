# Architecture

Portfolio Studio is one Electron app. The backend in `backend/` runs in the main process and owns every file and setting. The frontend in `frontend/` is a React and Mantine page in a sandboxed renderer.

## Frontend and backend

The frontend imports `backend/api/` with `import type` only, so no backend code runs in the renderer. The renderer's Vite build fails when any module under `backend/` enters its bundle. `backend/api/` has its own tsconfig without Node or DOM types, so its types stay usable on both sides.

## Calls between them

`backend/api/api.ts` declares every method, and `backend/ipc.ts` lists their names. The compiler checks that the two match. The preload exposes those names on `window.portfolio`, each forwarding to `ipcRenderer.invoke`. The main process answers only calls from the app window's top-level frame. Methods return errors as values, `{ ok: false, error }`, so the frontend handles each failure where it makes the call.

## Website files

The three catalogs in `data/` hold the website's content. Every save regenerates four files from them: `js/photography-catalog.js`, `js/archive-photo-settings.js`, and the marked regions of `engineeringdesign.html` and `creativedesign.html`. A save skips each file whose bytes would not change, so saving without edits changes nothing. A save refuses to write when any of these files changed after the app loaded it, because saving stale data after a pull would undo the pulled work. The owner then presses Reload.

## Security

The renderer runs in the OS sandbox with context isolation and no Node, and the app denies navigation and new windows. The sandbox stays on everywhere, because the app edits the owner's files. On Linux, running from source needs the one-time setup in `testing.md`.

The renderer sees images only through the read-only `portfolio:` protocol, which serves image files from the website's image folders and nothing else.

## Private data

Settings (`settings.json`) and the window state (`window-state.json`) are electron-store files in Electron's user data folder:

- Linux: `~/.config/Portfolio Studio/`
- Windows: `%APPDATA%\Portfolio Studio\`
- macOS: `~/Library/Application Support/Portfolio Studio/`

The app checks each file with zod when it reads it, and uses the defaults when a file is missing or invalid.
