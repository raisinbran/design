# Portfolio Studio and Photo Processor: Final Electron Plan

The revised design uses **one shared web codebase and two independently launchable Electron apps: Portfolio Studio and Photo Processor**.  Each published photo produces one web-ready thumbnail containing all image adjustments, watermarks, and embedded usage notices.

Electron requires platform-specific installation packages for macOS and Windows.  A single executable cannot realistically serve both.  Both platforms will use the same application code and build configuration, with native packages generated automatically.

## 1. Define the Two Apps and Their Responsibilities

**Portfolio Studio** manages Photography, Engineering, Archive, Settings, and About.  It handles catalog browsing, descriptions, tags, visibility, prominence, ordering, content editing, local website previews, and local saves.

**Photo Processor** handles importing originals, rotation, straightening, cropping, resizing, encoding, watermarking, embedded metadata, and publication-image generation.  It includes its own settings, previews, progress, and recovery interface.

Both apps must work when the other is closed or absent.  Photo Processor can independently select a portfolio folder and add processed photos to its catalog.

## 2. Use a Shared, Clean Architecture

Build both interfaces with React, TypeScript, and Vite, and package them with Electron Forge.  Organize the code around:

- Separate application entry points and interfaces.
- Shared interface components and appearance settings.
- Shared content models, catalog validation, and safe file operations.
- Photo Processor’s image-processing engine.
- A small, versioned integration contract between the apps.

Keep image processing outside the interface thread.  Use sandboxed renderers, context isolation, and narrowly scoped communication with Electron’s filesystem services.  Bundle required runtime resources so users do not need Python or a separately configured server.

## 3. Make Linking Optional and Explicit

Give Portfolio Studio a Photo Processor integration that users can enable by locating or installing the companion app.

When linked, Studio can launch Photo Processor to prepare new photos or adjust an existing photo’s framing.  It passes a validated workspace reference and task identifier.  Photo Processor opens the relevant source and private edit recipe, then reports completion so Studio can refresh its catalog.

Use authenticated local communication with a versioned message format.  Keep private source paths out of public website files.

Both apps use the same catalog-saving rules, file-change checks, and workspace locking.  Linking must not create two competing writers or duplicate processing logic.  If the integration is unavailable, Studio explains how to open Photo Processor independently.

## 4. Modernize Both Interfaces Consistently

Use a Discord-inspired shell with persistent navigation, a central workspace, contextual controls, and clear save and processing status.

Studio emphasizes content management.  Photo Processor emphasizes an import queue, large image preview, editing controls, and output inspection.  Include keyboard navigation, platform-appropriate shortcuts, undo/redo, accessible focus indicators, and resizable panels.

Provide **Light, Dark, and System**, defaulting to System.  Apply changes immediately and persist the preference.  System follows operating-system changes while running; explicit Light or Dark takes precedence.  Resolve the theme before the first visible frame and apply it consistently to dialogs and window chrome where supported.

## 5. Generate Exactly One Published Image per Photo

Replace the full-size-plus-thumbnail pipeline with one optimized, gallery-ready image.  Retain “thumbnail” in technical storage where useful, but label it **Published Image** in the interface because it is now the sole public photo.

Move all applicable output controls to this image: dimensions, format, quality, rotation, straightening, cropping, watermark settings, authorship, and embedded usage notices.

Start with the existing thumbnail defaults of an 800-pixel maximum side and WebP quality 78, while allowing users to adjust output settings.  Preserve format compatibility with the website.

Use one rendering sequence:

**Read original → correct orientation → straighten → crop → resize → watermark → embed metadata → encode.**

Keep originals read-only.  Store edit recipes and source references privately, outside the website repository.  Do not write full-size exports or clean intermediates into public folders.

## 6. Apply All Protection Settings to the Published Image

Apply both tiled and corner watermarks to the sole published image.  Slightly reduce tiled-watermark visibility from the previous treatment, using a shared strength setting and representative bright, dark, and detailed photos to judge the result.

Preview the actual encoded output so users can assess watermark visibility at its final dimensions.

Preserve the existing embedded authorship, copyright, and anti-AI usage notices, including applicable EXIF/XMP and IPTC/PLUS fields.  These notices communicate restrictions; they do not technically prevent AI training.  The reviewed implementation does not establish an existing adversarial pixel-protection feature, so adding one would require a separate specification.

Reprocessing always starts from the original and saved recipe, preventing repeated watermarking and compression.  Missing originals require relinking.

## 7. Preserve Safe Local Publication and Website Compatibility

Photo Processor’s **Add to Photo Catalog** action validates selections, generates the single output, and updates the catalog together.  Studio’s **Save Locally** action saves management changes.

Use staged files, private backups, external-change detection, and restart recovery.  Show clear overwrite, rename, or skip choices for conflicts.

Update website readers to accept the single-image model while continuing to display legacy paired entries.  Preserve descriptions, tags, visibility, prominence, order, dimensions, and cache-version information.  Remove any interface behavior that assumes a second full-size image.

Existing full-size files require a reviewed migration: identify references, update consumers, and offer deliberate cleanup with recovery.  Do not silently delete them.

GitHub Desktop remains the owner-controlled commit-and-push step.

## 8. Implement and Verify in Stages

Deliver shared foundations and independent launchers first, then Photo Processor’s complete import-to-catalog workflow, Studio’s content editors, optional linking, and legacy migration.

Preserve arrangement suggestions, manual ordering, locked positions, Engineering rich text and mixed media, and Archive collections.  Route photography pixel edits through Photo Processor.

Verify unchanged originals, exactly one output for each new publication, preview/export agreement, metadata privacy, interrupted-save recovery, concurrent-app conflicts, and website rendering.

Test both installed apps independently and linked on macOS and Windows.  Prove HEIC decoding and packaged image-processing support early.  Measure startup, scrolling, crop responsiveness, and batch processing before replacing the Python app.
