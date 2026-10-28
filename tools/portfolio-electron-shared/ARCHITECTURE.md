# Electron Architecture

The repository is an npm workspace with independent apps in `tools/portfolio-studio-electron` and `tools/photo-processor-electron`. Each has its own manifest, main/preload/renderer entry, Forge configuration, and launchers. Vite bundles this shared source into each app. Installed apps do not import the companion's files or require the website checkout as executable code. Nested production dependencies include Sharp/libvips, the bundled libheif HEIC decoder, and the HTML parser. Native Sharp libraries are unpacked from ASAR.

## Privilege and Data Boundaries

`src/main/desktop.ts` owns native windows and named IPC operations. The renderer is sandboxed, uses context isolation, has Node disabled, and cannot navigate to arbitrary content. The preload exposes only `DesktopBridge`; handlers verify the top-level sending window. Originals use opaque renderer handles. Workspace paths, originals, recipes, credentials, journals, and backups remain in the main process or private application data.

`WorkspaceRegistry` canonicalizes selected folders, validates catalogs, rejects traversal and symlinks, and hashes catalogs plus generated website consumers. `PublicationService` validates management drafts and installs the exact preview bytes. `Transactions` stages changes under a shared writer lock, saves private before/after backups, and records a journal before installation. Recovery proves dead ownership, takes an exclusive recovery claim, verifies current-file and backup hashes, and refuses to overwrite independent edits. Private recipe changes participate in publication transactions. Originals cannot be output or cleanup destinations.

Private data defaults to the OS application-data folder, under `Portfolio Tools`. The two apps use separate user-data subdirectories and single-instance locks. Advanced installations and automated QA may set **PORTFOLIO_DATA_DIRECTORY** to an absolute private directory; both apps must receive the same value to share recipes, locks, and linking. The directory is created with restrictive permissions where supported and must be outside the selected website. QA uses a disposable directory and never changes HOME.

## Processing and Content

`image-worker.ts` runs outside the interface thread. It reads an original, corrects orientation, rotates/straightens, crops, resizes, applies adaptive tiled/corner watermarks, creates allowlisted EXIF/XMP notices, and encodes once. Defaults are 800px maximum side and WebP quality 78. The exact encoded bytes remain in a bounded private render cache until publication. Recipe or original changes require a fresh render. The displayed encoded image remains available after publication; its consumed token cannot be published again.

All three output formats (WebP, JPEG, PNG) carry verified authorship and rights notices. Raw rasterization strips source metadata. HEIC uses bundled `heic-decode`/`libheif-js`; AVIF stays on Sharp's decoder. Linux compiled and packaged-worker tests decoded a real synthetic HEVC fixture and verified the final notices. Codec evidence for macOS and Windows remains a native release gate.

Studio preserves catalog extension fields and offers photography management, ordering/locks/suggestions, Engineering rich text/mixed media, and Archive collections. Saves materialize the website HTML/settings and generated photography JavaScript. Existing paired photographs remain supported; new entries mark `publishedImage:true` and use one file under `photography/thumbnails`. Reviewed legacy migration and cleanup are separate, recoverable actions.

Optional linking uses authenticated version 1 loopback messages and private rendezvous files. Studio explicitly locates/enables the companion. Completion requires a main-process publication receipt; unavailable linking leaves both apps usable independently. Local website previews use a separate restricted server and a sandboxed window without filesystem IPC.

## Builds and Verification

Run `npm ci`, `npm run typecheck`, `npm run test:electron`, and `npm run build:electron`. Forge packages both apps with `npm run package:electron`; native installers use each app's `make` script. The copy filter includes each app's production dependencies and excludes its Electron development module. Linux final package resources are approximately 24MB ASAR plus 34MB native unpacked data per app; Electron itself adds platform-dependent size.

Reusable browser, package, native-window, and performance checks are in `qa/`. See [release verification](../../../docs/electron/RELEASE_VERIFICATION.md). Neither app commits or pushes; GitHub Desktop remains the owner-controlled publication step. Keep the Python app until native release acceptance passes.
