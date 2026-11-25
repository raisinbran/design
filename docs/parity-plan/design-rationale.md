# Why the website and the app look and behave the way they do

This records the reasoning behind UI and design choices. Each entry names where its reason comes from, so a reader can tell a stated reason from a guess:

- **Owner**: the owner said it in a working conversation (paraphrased).
- **Repo**: written in the repository, in `portfolio-studio/AGENTS.md`, `portfolio-studio/docs/architecture.md`, or a code comment (file named).
- **Owner to confirm**: the choice is visible in the code but no reason is written down. The question is listed in the last section; do not read any silence here as a reason.

For what was asked and whether it is built, see [owner-requests.md](owner-requests.md).

## The app (Portfolio Studio)

### Working model

| Choice                                                                                     | Reason                                                                                                       | Source                                           |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| The app writes files and never commits. The owner publishes in GitHub Desktop.             | The owner stays in control of what goes live; the app only edits the working folder.                         | Repo (`AGENTS.md`, architecture "Using the app") |
| A save regenerates the generated site files and skips any whose bytes would not change.    | Saving without edits must change nothing, so `git` shows only real edits.                                    | Repo (architecture)                              |
| A save refuses when a site file changed after the app loaded it; the owner presses Reload. | Saving stale data after a pull would undo the pulled work.                                                   | Repo (architecture)                              |
| Unsaved edits share one undo history, cleared on save or load.                             | Git keeps the history of saved work.                                                                         | Repo (architecture)                              |
| Engineering text is sanitized only when edited.                                            | Sanitizing rewrites markup such as entities and inline styles, and a save without edits must change nothing. | Repo (architecture)                              |
| The photo order in the app is the order on the site; a lock exists only in the catalog.    | What the owner arranges is what visitors see.                                                                | Repo (architecture)                              |

### Layout and controls

| Choice                                                                                                                                                   | Reason                                                                                                                               | Source                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Toolbars have fixed dimensions and stable control positions; unavailable controls are disabled, not hidden or resized.                                   | Controls must not jump under the pointer when a selection or mode changes.                                                           | Repo (`AGENTS.md`)                                                                             |
| No permanent tutorial text or status banners inside editing canvases. Tools are explained in Help and short tooltips; active tools show a pressed state. | The canvas stays clear for the photo.                                                                                                | Repo (`AGENTS.md`)                                                                             |
| The compact Photo Editor has two toolbars and no visible More button; Help is an icon.                                                                   | Keeps the main controls to two rows.                                                                                                 | Repo (`AGENTS.md`)                                                                             |
| One color scheme across the app (Light, Dark, System), all surfaces from theme tokens.                                                                   | Panels must never disagree about light or dark.                                                                                      | Repo (`AGENTS.md`). Owner expects System to follow the operating system (open bug on Windows). |
| Icon-only buttons need an accessible label and a tooltip with no delay.                                                                                  | Screen-reader access and instant discoverability.                                                                                    | Repo (`AGENTS.md`)                                                                             |
| Crop fields are enabled only while cropping or when a crop exists; Clear crop only with a crop. Positions stay fixed.                                    | Same rule as toolbars: disable, never move.                                                                                          | Repo (`AGENTS.md`)                                                                             |
| Typing the rotation angle is the main way to rotate; no rotate-left and rotate-right buttons.                                                            | The owner's decision; no further reason was given.                                                                                   | Owner                                                                                          |
| No upper or lower limit on custom viewport size.                                                                                                         | The owner did not set the old limits and does not want any.                                                                          | Owner                                                                                          |
| A crop is measured inside the largest rectangle with the original's shape that fits in the straightened photo.                                           | No crop can show blank corners, and the frontend needs no rotation geometry.                                                         | Repo (architecture)                                                                            |
| Images decode and render only in a worker, one job at a time; a new job or Cancel ends the running one.                                                  | Decoding a phone's HEIC takes about a second and would freeze the window; an old render must never become the image that Add writes. | Repo (architecture)                                                                            |

### Media and pages

| Choice                                                                                                                           | Reason                                                                                                         | Source                                 |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| One Media screen assigns each file to pages by checkbox. Moving or duplicating a photo between pages is changing its checkboxes. | The owner wanted a master organizer instead of each page managing its own images.                              | Owner; plan in `plan/media-library.md` |
| The description (alt text) is the same on every page; caption and credit belong to each page's use.                              | The description says what the picture shows, which does not change by page; a caption is written for its page. | Owner                                  |
| Credit is a separate optional line, not carried to other pages.                                                                  | It credits a source for one use.                                                                               | Owner                                  |
| Greyed page checkboxes explain where the file is used.                                                                           | A disabled box with no explanation looks broken.                                                               | Owner                                  |
| Renaming a shared photo is allowed and every page follows.                                                                       | The owner rejected a rule that would block renaming.                                                           | Owner                                  |
| "Archive" is called "Design" in the app.                                                                                         | Matches the owner's name for the section.                                                                      | Owner                                  |
| "Projects" is the word on both Engineering and Design.                                                                           | One shared term.                                                                                               | Owner                                  |
| Photography images live in `images/Photography/`; the `thumbnails` folder is gone.                                               | The site no longer has separate thumbnail and full-size versions, so the name was a misnomer.                  | Owner                                  |
| `data/media-library.json` holds only assignments; the website never reads it.                                                    | Page assignments are an editing aid, not site content.                                                         | Owner approved; Repo (plan)            |
| Edit Image on a photo another page uses writes a new file and repoints every page.                                               | No page is left pointing at bytes that changed under it.                                                       | Repo (plan, `add.ts`)                  |
| The app is version 2.x.x.                                                                                                        | The Python app was version 1.                                                                                  | Owner                                  |
| Installers are one click-to-run file per system.                                                                                 | The owner wants a simple install.                                                                              | Owner                                  |
| Photo descriptions suggested automatically should be lightweight, local and need no setup.                                       | Accuracy is not critical and setup must be easy on any PC.                                                     | Owner (not built)                      |

## The website

The site is static HTML, CSS and JavaScript at the repository root. No design reasons for it were recorded before this file. These are the choices the code itself explains.

| Choice                                                                                                                                                       | Reason                                                                                 | Source                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------- |
| Content is at most 1200 px wide; side gutters are 16 px, then 24 px from 768 px and 32 px from 1024 px.                                                      | Owner to confirm; the values are the `--site-*` tokens in `css/site.css`.              | Owner to confirm        |
| Motion respects the reduced-motion setting.                                                                                                                  | Accessibility.                                                                         | Repo (`css/site.css`)   |
| Photography filter chips wrap in sequence at their natural width on mobile.                                                                                  | Written in `css/photography.css` as the mobile behavior; no reason given.              | Owner to confirm        |
| Only one Engineering project is open at a time; opening one scrolls to it and closes the others first.                                                       | Matches the original Engineering page; closing first keeps the scroll geometry stable. | Repo (`js/projects.js`) |
| Gallery rows are planned together so full rows are justified with exact gaps; a lone last photo keeps its natural size.                                      | Avoids leftover gutters and inflated gaps between photos.                              | Repo (`js/projects.js`) |
| Prominence only changes row planning, never crops a photo; source aspect ratios stay unchanged.                                                              | The photographs are not altered by layout.                                             | Repo (`js/projects.js`) |
| Only a user opening a project scrolls the page; the initial load does not.                                                                                   | The page should not jump on arrival.                                                   | Repo (`js/projects.js`) |
| The home hero rotates photos that are checked first; broken or unlisted ones are replaced from the published catalog, and the first two slides show at once. | No blank slide, and a mobile connection does not wait for all 12 photos.               | Repo (`js/home.js`)     |
| Hover pause on the hero applies to a real mouse only.                                                                                                        | Touch devices send fake hover events.                                                  | Repo (`js/home.js`)     |
| The Engineering card's crop keeps the locomotive in the upper center.                                                                                        | Keeps the subject in frame.                                                            | Repo (`css/home.css`)   |
| The Design card sits directly below Photography in the two-column layout.                                                                                    | Keeps the Design card directly below Photography in the two-column layout.             | Repo (`css/home.css`)   |

An earlier brief, `../261030_portfolio-responsive-layout-audit-agent-brief.md`, planned a read-only layout audit (four pages at 390 and 1920 px wide). No audit report was found in the repository.

## Reasons the owner can supply

Answer in a few words each; they will be recorded above. None of these has a written reason.

1. Why the 1200 px content width and the 16, 24 and 32 px gutters?
2. Why do Photography filter chips wrap at natural width on mobile, showing two rows with the rest reached by scrolling?
3. What guides the home page: why a rotating photo hero and preview cards for Engineering and Photography, and what each preview is meant to say?
4. Why are Engineering projects collapsible, while Design projects open differently (expanded flags, taller headers)?
5. What decides a photo's display priority (low, normal, portrait boost, featured)?
6. Which fonts and colors define the site, and why? (Not recorded.)
7. Why does the app use Mantine's look rather than the site's?
