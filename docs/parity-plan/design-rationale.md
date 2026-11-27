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
| The app is version 1.0.0.                                                                                                        | The Python app was version 1.                                                                                  | Owner                                  |
| Installers are one click-to-run file per system.                                                                                 | The owner wants a simple install.                                                                              | Owner                                  |
| Photo descriptions suggested automatically should be lightweight, local and need no setup.                                       | Accuracy is not critical and setup must be easy on any PC.                                                     | Owner (not built)                      |

## The website

The site is static HTML, CSS and JavaScript at the repository root. No design reasons for it were recorded before this file. These are the choices the code itself explains.

| Choice                                                                                                                                                       | Reason                                                                                                                                                                                                                                     | Source                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Content is at most 1200 px wide; side gutters are 16 px, then 24 px from 768 px and 32 px from 1024 px.                                                      | Introduced by the owner's account on 2026-10-25 in commit `c814c3e` ("Large site overhaul") as "1200px max outer container, including responsive internal gutters". No reason was written down; see "Where 1200 px might come from" below. | Repo (commit `c814c3e`); reason not recorded. Owner chose to keep 1200 px on 2026-11-26 |
| Motion respects the reduced-motion setting.                                                                                                                  | Accessibility.                                                                                                                                                                                                                             | Repo (`css/site.css`)                                                                   |
| Photography filter chips wrap in sequence at their natural width on mobile.                                                                                  | Written in `css/photography.css` as the mobile behavior; no reason given.                                                                                                                                                                  | Owner to confirm                                                                        |
| Only one Engineering project is open at a time; opening one scrolls to it and closes the others first.                                                       | Matches the original Engineering page; closing first keeps the scroll geometry stable.                                                                                                                                                     | Repo (`js/projects.js`)                                                                 |
| Gallery rows are planned together so full rows are justified with exact gaps; a lone last photo keeps its natural size.                                      | Avoids leftover gutters and inflated gaps between photos.                                                                                                                                                                                  | Repo (`js/projects.js`)                                                                 |
| Prominence only changes row planning, never crops a photo; source aspect ratios stay unchanged.                                                              | The photographs are not altered by layout.                                                                                                                                                                                                 | Repo (`js/projects.js`)                                                                 |
| Only a user opening a project scrolls the page; the initial load does not.                                                                                   | The page should not jump on arrival.                                                                                                                                                                                                       | Repo (`js/projects.js`)                                                                 |
| The home hero rotates photos that are checked first; broken or unlisted ones are replaced from the published catalog, and the first two slides show at once. | No blank slide, and a mobile connection does not wait for all 12 photos.                                                                                                                                                                   | Repo (`js/home.js`)                                                                     |
| Hover pause on the hero applies to a real mouse only.                                                                                                        | Touch devices send fake hover events.                                                                                                                                                                                                      | Repo (`js/home.js`)                                                                     |
| The Engineering card's crop keeps the locomotive in the upper center.                                                                                        | Keeps the subject in frame.                                                                                                                                                                                                                | Repo (`css/home.css`)                                                                   |
| The Design card sits directly below Photography in the two-column layout.                                                                                    | Keeps the Design card directly below Photography in the two-column layout.                                                                                                                                                                 | Repo (`css/home.css`)                                                                   |

An earlier brief, `../261030_portfolio-responsive-layout-audit-agent-brief.md`, planned a read-only layout audit (four pages at 390 and 1920 px wide). No audit report was found in the repository.

## Where 1200 px might come from

The investigation of 2026-11-25 found no stated reason for 1200 px. What it did find:

**In this repository.** The value first appears in commit `c814c3e` (2026-10-25) in a block labelled "R15 shared responsive layout", which also sets the 16, 24 and 32 px gutters. The only explanation is the one-line comment quoted above; nothing else in the repository, commit messages or docs mentions it. The same width is used by the content shell (`--site-content-max`, `--site-shell-max`) and by `css/photography.css` and `css/projects.css`.

**Other widths in the site CSS.** They are not one system:

| Width                  | Where                                                  | Used for                                                               |
| ---------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| 1200 px                | `css/site.css`, `photography.css`, `projects.css`      | Main content shell                                                     |
| 1120 px                | `css/site.css:14`, `css/home.css:45`, `:279`           | Navigation inner width (with 48 px of side margin), home page sections |
| 1100 px                | `css/site.css:460`                                     | Footer inner width                                                     |
| 1550 px                | `css/site.css:200`, `css/home.css:395`, `:408`, `:681` | Full-bleed hero image and its caption                                  |
| 680, 720, 768, 1024 px | `@media` rules                                         | Mobile and desktop breakpoints (680 and 720 are used the most)         |

**Outside the repository.** A web search found no source that names 1200 px as a standard container width:

- Bootstrap's container maximum has changed with each version: 1170 px in Bootstrap 3 (reached at a 1200 px viewport), 1140 px in Bootstrap 4, and in Bootstrap 5 1140 px at the 1200 px breakpoint and 1320 px at 1400 px ([Bootstrap 5.3 containers](https://getbootstrap.com/docs/5.3/layout/containers/)). So 1200 px is a viewport breakpoint there, not the container width. One forum answer notes nobody could find why Bootstrap 3 chose 1170 ([discussion](https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/20059009/average-most-popular-screen-size-and-bootstrap3)).
- The older 960 Grid System (Nathan Smith) chose 960 px because it fit a 1024 px screen and divides by 12, 16 and 24 ([960.gs](https://960.gs/), [CSS-Tricks](https://css-tricks.com/?p=642)). 1200 px does not follow from that rule; it is a different, later convention of wider screens.
- Capping content width is also done for readable line length ([EBI style guide](https://www.ebi.ac.uk/web/style/grids-layout)).
- The earlier layout-audit brief cited the Steam survey (September 2026, 47.91% at 1920 × 1080), which samples gaming users and overstates it. [StatCounter](https://gs.statcounter.com/screen-resolution-stats/desktop-ww/worldwide) puts 1920 × 1080 first at about 20 to 22% of desktop visits, then 1536 × 864 (about 7%) and 1366 × 768 (about 5%). A 1200 px shell on a 1920 px window leaves wide margins, which the 1550 px hero image breaks out of.

**Container widths in common use** (2026-11-26 search; blog and forum guides are opinion, not usage data):

| Width        | Source                                                               |
| ------------ | -------------------------------------------------------------------- |
| 1140 px      | Bootstrap 5 `xl` container                                           |
| 1280 px      | Tailwind `max-w-7xl` (80rem); the value guides name most often       |
| 1320 px      | Bootstrap 5 `xxl` container                                          |
| 1536 px      | Tailwind's largest container step                                    |
| 1140 to 1280 | The range one developer guide gives for a centered content container |
| 1440 px      | One agency's choice, based on MacBook screens                        |

Text is a separate limit: [Baymard](https://baymard.com/research-articles/line-length-readability) and WCAG 1.4.8 put readable lines at 45 to 80 characters, which caps body text, not the page container.

**Conclusion.** 1200 px is in the same range as the common framework containers (1140 to 1320 px) and works on a 1280 px or larger window. It is not copied from any one standard, and the repository does not record why it was chosen. It stays "reason not recorded" unless the owner remembers one. **Decision (owner, 2026-11-26): keep 1200 px.** The owner has no attachment to the number, and nothing found makes another width clearly better.

## Reasons the owner can supply

Answer in a few words each; they will be recorded above. None of these has a written reason.

1. Why the 16, 24 and 32 px gutters? (The 1200 px width was investigated; see below.)
2. Why do Photography filter chips wrap at natural width on mobile, showing two rows with the rest reached by scrolling?
3. What guides the home page: why a rotating photo hero and preview cards for Engineering and Photography, and what each preview is meant to say?
4. Why are Engineering projects collapsible, while Design projects open differently (expanded flags, taller headers)?
5. What decides a photo's display priority (low, normal, portrait boost, featured)?
6. Which fonts and colors define the site, and why? (Not recorded.)
7. Why does the app use Mantine's look rather than the site's?
