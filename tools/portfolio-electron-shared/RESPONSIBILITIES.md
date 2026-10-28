# Application Responsibilities and Catalog Mapping

Portfolio Studio owns Photography descriptions, tags, visibility, prominence, arrangement suggestions, manual ordering and position locks; Engineering rich text and mixed image/video media; Archive collections; local website previews; Settings; and About. Its explicit persistence action is **Save Locally**. It delegates photography pixel changes to Photo Processor only when the user enables linking.

Photo Processor independently selects a portfolio repository, imports read-only originals, edits orientation/framing, creates an actual encoded preview, and adds one protected Published Image and its catalog record together through **Add to Photo Catalog**. It owns processing settings, progress, recovery, and private source relinking. Neither launcher depends on the companion being installed or running.

Both share typed content, appearance, validation, workspace identity, locking, file-change detection, and transactional persistence. Only Processor owns image generation. Neither application commits or pushes; GitHub Desktop remains the owner's publication step. The Python tool in `tools/portfolio-studio` remains available until native verification succeeds.

## Observed Repository Contracts

- `data/media-catalog.json`: schemaVersion 1, `photoTags`, and ordered `photos` (28 current entries). `file` is the identity and legacy full-size basename in `photography/published`; `thumbnail` is a basename in `photography/thumbnails`. Preserve `thumbnailFramed`, dimensions, cache versions, `galleryCrop`, optional review flags, and extension fields. Current generated consumer is `js/photography-catalog.js`, defining `PORTFOLIO_PHOTOS`, `PHOTO_ASPECT_RATIOS`, and `PHOTO_TAG_LABELS`. Existing Python validation assumes `file` exists in the full-size directory and must not govern new single-image output.
- Single-image extension: `publishedImage: true` makes `thumbnail` the sole public file, still under `photography/thumbnails`. `file` remains a stable logical key; do not create a duplicate file to satisfy the legacy assumption. Legacy records without this marker retain their paired behavior until deliberately migrated. Readers must branch on this flag before deriving a full-size URL.
- `data/engineering-catalog.json`: schemaVersion 1, ordered `projects` (7 current entries). Preserve `bodyHtml`, mixed `media.kind` image/video, `coverPosition`, `visible`, `expanded`, and legacy round-trip fields `legacyHtml`, `separator`, and `baseline`. The current site is materialized in `engineeringdesign.html`; saving JSON alone does not update that page.
- `data/archive-catalog.json`: schemaVersion 1, two collections with individually identified media, crop/position/prominence controls, preserved HTML attributes, and source-template fields `sourceHtml`, `sourceSha256`, `settingsSource`, and `prominenceOverrides`. The page is `creativedesign.html`; prominence settings are `js/archive-photo-settings.js`. Editing must update all relevant consumers and preserve template content outside edited sections.
- Valid prominence values in the existing Archive implementation are `low`, `normal`, `portraitBoost`, and `featured`. Array order controls presentation. Existing arrangement locks are editor state rather than catalog fields.
- Existing public rights defaults are author `Brandon J. Chen`, copyright `Copyright (c) Brandon J. Chen`, and the opt-out notice in `tools/portfolio-studio/export_rights.py`, including PLUS `DMI-PROHIBITED-AIMLTRAINING`. Fresh exports deliberately exclude source metadata. Preserve these notices without claiming technical prevention of training.

## Private State Boundary

Private original paths, saved edit recipes, integration credentials, journals, and backups belong outside the selected website repository, in shared application user data keyed by a canonical workspace identity. Renderer-facing source identifiers should be opaque handles. An authenticated versioned companion task identifies workspace and operation without placing private paths in public JSON or generated JavaScript.

The initial models are in `src/models.ts`; runtime validation, IPC, packaging, interfaces, and worker implementation follow in the subsequent numbered steps. Each app has its own typed `src/app-definition.ts`, so responsibility decisions are usable by the forthcoming navigation and launcher code.
