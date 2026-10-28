# Photo Processor (Electron)

New independent desktop application for importing read-only originals, preparing exactly one Published Image per photo, inspecting its encoded preview, and adding it to a selected portfolio catalog. Source responsibilities are declared in `src/app-definition.ts`; shared models are in `../portfolio-electron-shared/src/models.ts`.

Owns rotation, straightening, cropping, resizing, encoding, tiled/corner watermarking, embedded rights metadata, private recipes, source relinking, progress, and recovery. The primary action is **Add to Photo Catalog**. Portfolio Studio is optional.

Private source references and recipes must stay outside the selected website repository.

## Development and Packaging

From the repository root, install Node.js 22 or later and run `npm ci`. Start independently with `npm run start:processor`, or use `Launch.command` / `Launch.bat`. Run `npm run make --workspace @portfolio/processor` on the target platform. Production packages contain their own Electron and Sharp/libvips runtime; the companion app, Python, and a separately configured server are not required.

Native image operations run in a worker outside the renderer. Each package bundles Sharp/libvips and a libheif HEIC decoder. Real HEIC decoding and rights metadata passed both final Linux packaged-worker checks. macOS/Windows installed-app and codec acceptance remains pending; see [release verification](../../../docs/electron/RELEASE_VERIFICATION.md).

See the [workflow guide](../../../docs/electron/README.md) for recipes, queue rendering, explicit per-photo publication, optional linking, recovery, and migration. After publication the encoded image remains visible for inspection; its consumed token cannot publish twice.
