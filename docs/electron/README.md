# Portfolio Desktop Tools

Two independent Electron apps share one React/TypeScript codebase:

- **Portfolio Studio** manages Photography, Engineering, and Archive content. Use **Save Locally** to materialize website changes.
- **Photo Processor** imports read-only originals, edits framing/output/protection, previews actual encoded bytes, and uses **Add to Photo Catalog** to publish one image and its catalog entry together.

## Launch from Source

Install Node.js 22 or later. From the `design` repository root:

```sh
npm ci
npm run start:studio
# In another terminal, if wanted:
npm run start:processor
```

Each app folder also contains `Launch.command` and `Launch.bat`. Installed packages include Electron and all processing dependencies; they require no Python, companion installation, or separately configured server. Build native packages on the target OS with `npm run make --workspace @portfolio/studio` and `npm run make --workspace @portfolio/processor`.

## Local Workflow

Choose the portfolio folder containing `data/media-catalog.json`, the Engineering/Archive catalogs, and the website files. In Processor, import originals, select output controls, render the encoded preview, enter a description/tags, and add the selected image. **Render Queue Previews** processes the queue sequentially; publication remains explicit per selected photo. Originals stay unchanged. Preview bytes and published bytes are identical. Reprocessing starts from the saved original and recipe; missing originals require relinking.

Studio edits descriptions, tags, visibility, prominence, order, and locked positions. Arrangement suggestions remain reviewable. Engineering supports rich text and image/video media; Archive supports collections and per-image presentation. Undo/redo, platform shortcuts, resizable panels, and Light/Dark/System are available. System follows OS changes while running.

Linking is optional. In Studio Settings, locate the installed Photo Processor and enable linking. New-photo and framing tasks open the companion; completed publication refreshes Studio. Independent edits can be reconciled before saving. Both apps remain usable with linking disabled or the companion absent.

## Recovery and Existing Images

Save conflicts offer Skip, Rename, or Overwrite. External changes cause a refresh/reconciliation request. Settings and Processor Recovery list private transaction backups and interrupted saves. Recovery refuses a live writer or unrelated external edits. A hard crash during recovery itself can leave a conservative recovery claim requiring private-state review.

Legacy paired entries continue displaying. **Identify Legacy References** reviews migration candidates; migration keeps full-size files. Cleanup is a separate confirmed operation, blocked by remaining references or saved/active original uses, and has private recovery backups. No existing full-size photo is deleted automatically.

GitHub Desktop remains the commit-and-push step. Review website diffs there after local saves. The existing Python app remains available until the [native acceptance checklist](RELEASE_VERIFICATION.md) passes.
