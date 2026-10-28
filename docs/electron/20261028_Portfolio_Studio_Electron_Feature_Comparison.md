# Portfolio Studio Electron — Features and Comparison with Python Portfolio Studio

**Repository reviewed:** October 28, 2026, `master` branch.

The new [Portfolio Studio Electron](https://github.com/raisinbran/design/tree/master/tools/portfolio-studio-electron) is a standalone desktop application for managing the content of your portfolio website on Windows and macOS.

It replaces the Python/Tkinter interface with an Electron application built using React and TypeScript. It retains the core purpose of the predecessor: managing Photography, Engineering, and Archive content locally, then leaving final website publication to GitHub Desktop.

**The most significant improvements are the unified editing interface, undo/redo, conflict reconciliation, stronger recovery tools, and optional coordination with a separate application.** However, several existing Python interface capabilities are not yet reproduced.

## 1. All major Electron functions

| Area | Functions and features |
|---|---|
| **Navigation** | Dedicated Photography, Engineering, Archive, Settings, and About sections |
| **Workspace** | Choose a local portfolio repository; display the selected folder and content counts |
| **Photography** | Browse published photographs, search, edit descriptions and tags, change visibility, featured status and prominence |
| **Gallery arrangement** | Suggest photo ordering, manually move photos up/down, lock positions |
| **Engineering** | Add, remove and reorder projects; edit titles, headings, context, rich text, cover references, visibility and expansion |
| **Engineering media** | Manage image/video media entries, captions, credits, ordering and cover-related metadata |
| **Archive** | Add, remove and reorder collections; edit collection information and image metadata |
| **Archive images** | Edit captions, credits, alternative text, crop mode, position and prominence; reorder image entries |
| **Editing history** | Undo and redo staged edits with keyboard shortcuts |
| **Saving** | Save locally to the website catalogs and generated HTML/JavaScript |
| **Previewing** | Preview saved website pages in a restricted local preview window |
| **Conflict management** | Detect outside modifications and reconcile compatible independent edits |
| **Recovery** | Review transaction backups, restore earlier local states and recover interrupted saves |
| **Legacy photo management** | Identify legacy references, migrate selected catalog entries to single-image format and perform separately confirmed cleanup |
| **Settings** | Light, Dark and System appearance modes; optional companion application linking |
| **About** | Application identity, purpose and publication guidance |
| **Publishing control** | Does not commit or push changes to GitHub; user retains control through GitHub Desktop |

Sources: [Electron responsibilities](https://github.com/raisinbran/design/blob/master/tools/portfolio-electron-shared/RESPONSIBILITIES.md), [interface implementation](https://github.com/raisinbran/design/blob/master/tools/portfolio-electron-shared/src/renderer/studio-editor.tsx), [workflow documentation](https://github.com/raisinbran/design/blob/master/docs/electron/README.md).

## 2. Features Electron adds beyond the predecessor's main window

These are the most meaningful additions or substantial improvements compared with the existing Python interface.

| Electron feature | Difference from Python main window |
|---|---|
| **Unified Undo/Redo** | Both actions are available globally across the management editors. Python has more localized, editor-specific undo support. |
| **Three-way change reconciliation** | Can combine compatible edits made independently by two applications or processes. Python primarily requires reloading after outside changes. |
| **Central recovery interface** | Lets the user inspect and restore private transaction backups from Settings, rather than relying on individual editor backups or rollback behavior. |
| **Interrupted-save recovery** | Provides explicit recovery of stale writer locks and interrupted transactions, including after a process crash. |
| **Legacy photo migration** | Identifies references and supports a reviewed conversion to the newer single-image catalog format. |
| **Integrated migration cleanup** | Offers separate, guarded removal of obsolete full-size image files after reference and source-use checks. |
| **Optional companion linking** | Locates and connects to the independently installed companion application, with task handoff and catalog refresh after completion. |
| **Automatic external-change detection** | Warns about changes outside the editor while preserving staged edits for reconciliation. |
| **System-following appearance** | Light, Dark or System selection, including live operating-system appearance changes. |
| **Resizable three-panel interface** | Adjustable navigation and context panels with mouse and keyboard support. |
| **Workspace status dashboard** | Shows selected repository, photograph/project counts, pending edits and save status together. |

These are genuine improvements in the application's management infrastructure. They do not necessarily represent entirely new portfolio-content capabilities.

## 3. What remains equivalent to the Python predecessor

The following are existing capabilities, not new Electron features:

- Editing published photo descriptions, tags, prominence and visibility.
- Suggesting gallery arrangements, manually adjusting order and locking positions.
- Creating, editing, reordering and removing Engineering projects.
- Editing Engineering rich text, associated media and cover presentation.
- Managing Archive collections, image metadata and presentation.
- Saving local catalogs and generated website files without pushing to GitHub.
- Previewing website content.
- Maintaining recovery backups for local changes.

Electron implements these through a different interface and underlying file-management system.

## 4. Important capabilities missing or less complete in Electron

The Electron version is **not yet a complete feature-for-feature replacement** of the original main Portfolio Studio interface.

| Python capability | Electron status |
|---|---|
| **Visual gallery crop editor** | No equivalent interactive crop drawing, crop-ratio controls, composition grids or crop preview in the Photography management editor. |
| **Published-photo management actions** | Python provides actions for adding unlisted published photos, removing gallery entries, archiving files and repository cleanup. The Electron Photography editor does not expose equivalent general-purpose controls. |
| **Advanced Arrange Gallery interface** | Electron provides a simpler suggestion and move-up/down workflow. The predecessor has a more extensive arrangement interface. |
| **Engineering project duplication** | Python provides a Duplicate action; the Electron editor does not expose one. |
| **Engineering media file import** | Python can choose external files, prepare/import them and preview media. Electron's current editor primarily manages media records and paths. |
| **Archive image file import** | Python can import selected image files; Electron's Add Image creates an editable record requiring an image path. |
| **Editor-specific draft previews** | Python can preview unsaved Engineering and Archive edits. Electron's main preview action opens the saved website, not the staged draft. |

These differences matter because they affect ordinary content-management workflows, not just technical implementation.

In particular, the Electron Photography editor is currently more oriented toward modifying catalog metadata than performing the full visual gallery-management workflow available in Python.

## 5. How Electron saves changes

```text
Select local portfolio folder
    ↓
Load existing website catalogs and assets
    ↓
Edit Photography / Engineering / Archive
    ↓
Stage changes, undo/redo and review
    ↓
Save Locally
    ↓
Validate, back up and update website files
    ↓
Preview saved website
    ↓
GitHub Desktop: review, commit and push manually
```

Electron uses a shared transaction system to coordinate catalog and generated website-file changes. It checks for conflicting modifications and maintains private recovery records. Saving does not give the Electron app authority to deploy the live site.

## 6. Current verification status

The October 28, 2026 [release verification report](https://github.com/raisinbran/design/blob/master/docs/electron/RELEASE_VERIFICATION.md) reports:

- 27 Electron automated tests passed.
- Production builds and TypeScript checks passed.
- Linux packaged application and interface tests passed.
- Photography, Engineering and Archive local saving was exercised.
- Crash recovery and companion integration received automated testing.

However, **native installed-app acceptance on Windows and macOS remains incomplete**. In particular, installer behavior, native dialogs, application signing and representative hardware performance still require verification.

These results establish implementation and tested behavior in the documented environments, not complete release readiness.

## Overall assessment

Electron substantially improves the application's underlying reliability and consistency, while preserving the established local-save and GitHub Desktop publishing model.

Its most valuable new features are **cross-editor undo/redo, conflict reconciliation, transactional recovery and the consolidated interface**.

Its largest remaining functional gaps, relative to the original Portfolio Studio main window, concern **interactive Photography gallery management, Engineering media importing and unsaved-content previewing**.

Therefore, on the reviewed code, Electron is a functioning successor with meaningful improvements, but it should not yet be considered a complete functional replacement for the Python application's main window.

*This comparison excludes the Photo Processor's functions, as requested.*
