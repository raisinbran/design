# Architecture

Portfolio Studio is one Electron app. The backend in `backend/` runs in the main process and owns every file and setting. The frontend in `frontend/` is a React and Mantine page in a sandboxed renderer.

## Frontend and backend

The frontend imports `backend/api/` with `import type` only, so no backend code runs in the renderer. The renderer's Vite build fails when any module under `backend/` enters its bundle. `backend/api/` has its own tsconfig without Node or DOM types, so its types stay usable on both sides.

## Calls between them

`backend/api/api.ts` declares every method, and `backend/ipc.ts` lists their names. The compiler checks that the two match. The preload exposes those names on `window.portfolio`, each forwarding to `ipcRenderer.invoke`. The main process answers only calls from the app window's top-level frame. Methods return errors as values, `{ ok: false, error }`, so the frontend handles each failure where it makes the call.

## Website files

The three catalogs in `data/` hold the website's content. Every save regenerates four files from them: `js/photography-catalog.js`, `js/archive-photo-settings.js`, and the marked regions of `engineeringdesign.html` and `creativedesign.html`. A save skips each file whose bytes would not change, so saving without edits changes nothing. A save refuses to write when any of these files changed after the app loaded it, because saving stale data after a pull would undo the pulled work. The owner then presses Reload.

Engineering project text is HTML. A save passes each body that differs from the saved catalog through sanitize-html, which keeps only the tags the rich text editor makes, so a script or event handler from the renderer never reaches the site. Unedited bodies are left alone, because sanitizing rewrites markup such as entities and inline styles, and a save without edits must change nothing. The first edit to a body therefore also tidies it: inline styles, classes and layout `div`s go, and entities such as `&rtrif;` become characters.

The photography page and the home page show the visible photos in catalog order, so the order in the app is the order on the site. A lock (`locked`) lives only in the catalog; the generated script leaves it out.

## Unsaved edits and undo

Unsaved edits live in one zustand store, `frontend/app/editor.ts`, with zundo keeping the undo history. Saving or loading clears the history, because git keeps the history of saved work. In a text field, the undo and redo shortcuts act on that field's typing, as the browser does. The Engineering body editor, TipTap, keeps its own undo history while it has focus. Elsewhere the shortcuts step through the app's history, which also holds the field and body edits. A save keeps any edit made while it ran as an unsaved edit.

## Security

The renderer runs in the OS sandbox with context isolation and no Node, and the app denies navigation and new windows. The sandbox stays on everywhere, because the app edits the owner's files. On Linux, running from source needs the one-time setup in `testing.md`.

The renderer sees images only through the read-only `portfolio:` protocol, which serves image files from the website's image folders and nothing else.

## Private data

Settings (`settings.json`) and the window state (`window-state.json`) are electron-store files in Electron's user data folder:

- Linux: `~/.config/Portfolio Studio/`
- Windows: `%APPDATA%\Portfolio Studio\`
- macOS: `~/Library/Application Support/Portfolio Studio/`

The app checks each file with zod when it reads it, and uses the defaults when a file is missing or invalid.
