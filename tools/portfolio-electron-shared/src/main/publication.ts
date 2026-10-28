import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { WorkspaceCatalogs, Photo, EditRecipe } from "../models";
import type { WorkspaceView } from "../contracts";
import { publicReferences, isSavedOriginal } from "./migration";
import { validateCatalogs, safeBasename } from "../validation";
import { digest, workspaceFile, WorkspaceRegistry } from "./files";
import { fileDigest, Transactions, type FileChange } from "./transactions";
import { ProcessingService } from "./processing";
import {
  archiveOutput,
  asset,
  engineeringPage,
  jsonFile,
  photographyScript,
  validateContent,
} from "./site-content";
export interface PublishRequest {
  workspaceId: string;
  revision: string;
  sourceId: string;
  token: string;
  recipe: EditRecipe;
  photoKey?: string;
  name?: string;
  alt?: string;
  tags?: string[];
  conflict?: "overwrite" | "rename" | "skip";
}
export interface PublishResult {
  workspace: WorkspaceView;
  photoKey: string;
  skipped: boolean;
}
export class PublicationConflict extends Error {
  constructor(public name: string) {
    super(`A photograph or Published Image named ${name} already exists.`);
  }
}
export class PublicationService {
  constructor(
    private directory: string,
    private registry: WorkspaceRegistry,
    private transactions: Transactions,
    private processing: ProcessingService,
  ) {}
  private privateBoundary(workspaceId: string) {
    const root = this.registry.root(workspaceId);
    const relative = path.relative(root, this.directory);
    if (
      !relative ||
      (!relative.startsWith(".." + path.sep) &&
        relative !== ".." &&
        !path.isAbsolute(relative))
    )
      throw new Error(
        "Select a website folder that does not contain private application data.",
      );
  }
  async save(
    workspaceId: string,
    revision: string,
    input: unknown,
  ): Promise<WorkspaceView> {
    this.privateBoundary(workspaceId);
    const catalogs = structuredClone(validateCatalogs(input));
    const current = await this.registry.read(workspaceId);
    if (current.revision !== revision)
      throw new Error(
        "Files changed outside this window. Reload and reconcile before saving.",
      );
    await validateContent(
      this.registry.root(workspaceId),
      catalogs,
      current.catalogs,
    );
    await this.validatePhotos(workspaceId, catalogs.photography.photos);
    const changes = await this.contentChanges(
      workspaceId,
      revision,
      catalogs,
      current.catalogs,
    );
    await this.transactions.commit(
      workspaceId,
      revision,
      "Save Locally",
      changes,
    );
    return this.registry.read(workspaceId);
  }
  private async validatePhotos(
    workspaceId: string,
    photos: Photo[],
    pending?: string,
  ) {
    for (const photo of photos) {
      if (photo.thumbnail) {
        const relative = `photography/thumbnails/${photo.thumbnail}`;
        if (relative !== pending)
          await asset(this.registry.root(workspaceId), relative);
      }
      if (!photo.publishedImage)
        await asset(
          this.registry.root(workspaceId),
          `photography/published/${photo.file}`,
        );
    }
  }
  private async contentChanges(
    workspaceId: string,
    revision: string,
    catalogs: WorkspaceCatalogs,
    baseline: WorkspaceCatalogs,
  ): Promise<FileChange[]> {
    const root = this.registry.root(workspaceId);
    const expected = this.registry.baseline(workspaceId, revision);
    const changes: FileChange[] = [];
    const add = (relative: string, bytes: string | Uint8Array) =>
      changes.push({
        relative,
        bytes: typeof bytes === "string" ? Buffer.from(bytes) : bytes,
        expected: expected[relative] ?? null,
      });
    if (
      JSON.stringify(catalogs.photography) !==
      JSON.stringify(baseline.photography)
    ) {
      add("data/media-catalog.json", jsonFile(catalogs.photography));
      add("js/photography-catalog.js", photographyScript(catalogs.photography));
    }
    if (
      JSON.stringify(catalogs.engineering) !==
      JSON.stringify(baseline.engineering)
    ) {
      const page = await readFile(
        await workspaceFile(root, "engineeringdesign.html"),
        "utf8",
      );
      add(
        "engineeringdesign.html",
        engineeringPage(catalogs.engineering, page),
      );
      add("data/engineering-catalog.json", jsonFile(catalogs.engineering));
    }
    if (JSON.stringify(catalogs.archive) !== JSON.stringify(baseline.archive)) {
      const page = await readFile(
        await workspaceFile(root, "creativedesign.html"),
        "utf8",
      );
      const settings = await readFile(
        await workspaceFile(root, "js/archive-photo-settings.js"),
        "utf8",
      );
      const output = archiveOutput(
        catalogs.archive,
        baseline.archive,
        page,
        settings,
      );
      add("creativedesign.html", output.page);
      add("js/archive-photo-settings.js", output.settings);
      add("data/archive-catalog.json", jsonFile(output.catalog));
    }
    return changes;
  }
  async publish(request: PublishRequest): Promise<PublishResult> {
    const { workspaceId, revision } = request;
    this.privateBoundary(workspaceId);
    if (
      request.conflict !== undefined &&
      !["overwrite", "rename", "skip"].includes(request.conflict)
    )
      throw new Error("Invalid conflict choice");
    const current = await this.registry.read(workspaceId);
    if (current.revision !== revision)
      throw new Error(
        "Portfolio changed externally. Refresh before publishing.",
      );
    const prepared = await this.processing.publication(
      request.token,
      request.sourceId,
      request.recipe,
    );
    let name =
      request.photoKey || request.name || path.basename(prepared.originalPath);
    safeBasename(name);
    if (/[<>:"|?*]/.test(name) || /[. ]$/.test(name))
      throw new Error("Choose a filename compatible with macOS and Windows.");
    const photos = current.catalogs.photography.photos;
    let existing = photos.find(
      (photo) => photo.file.toLowerCase() === name.toLowerCase(),
    );
    if (request.photoKey && !existing)
      throw new Error("The framing photograph is no longer in the catalog");
    const extension = prepared.format === "jpeg" ? "jpg" : prepared.format;
    if (existing) name = existing.file;
    let thumbnail = `${name}.${extension}`;
    const root = this.registry.root(workspaceId);
    const occupied = async (key: string, filename: string) =>
      photos.some(
        (photo) =>
          photo.file.toLowerCase() === key.toLowerCase() ||
          photo.thumbnail?.toLowerCase() === filename.toLowerCase(),
      ) ||
      (await fileDigest(
        await workspaceFile(root, `photography/thumbnails/${filename}`),
      )) !== null;
    if ((await occupied(name, thumbnail)) && !request.photoKey) {
      if (!request.conflict) throw new PublicationConflict(name);
      if (request.conflict === "skip")
        return { workspace: current, photoKey: name, skipped: true };
      if (request.conflict === "rename") {
        const parsed = path.parse(name);
        let index = 2;
        do {
          name = `${parsed.name}-${index++}${parsed.ext}`;
          thumbnail = `${name}.${extension}`;
        } while (await occupied(name, thumbnail));
        existing = undefined;
      }
    }
    if (
      photos.some(
        (photo) =>
          photo.file !== existing?.file &&
          photo.thumbnail?.toLowerCase() === thumbnail.toLowerCase(),
      )
    )
      throw new Error(
        "The output filename belongs to another photograph. Choose a different name.",
      );
    const relative = `photography/thumbnails/${thumbnail}`;
    const filename = await workspaceFile(root, relative);
    if (path.resolve(filename) === (await realpath(prepared.originalPath)))
      throw new Error(
        "The selected original is read-only. Choose a different output name.",
      );
    const version = digest(prepared.bytes).slice(0, 12);
    const tags = request.tags ?? existing?.tags ?? [];
    const alt = request.alt ?? existing?.alt ?? path.parse(name).name;
    if (
      typeof alt !== "string" ||
      !alt.trim() ||
      !Array.isArray(tags) ||
      tags.some((tag) => typeof tag !== "string" || !tag.trim())
    )
      throw new Error(
        "Provide a description and valid tags before publication.",
      );
    const photo: Photo = {
      ...(existing || {}),
      file: existing?.file || name,
      alt,
      visible: existing?.visible ?? true,
      featured: existing?.featured ?? false,
      displayPriority: existing?.displayPriority ?? "normal",
      aspectRatio: prepared.width / prepared.height,
      tags,
      thumbnail,
      thumbnailWidth: prepared.width,
      thumbnailHeight: prepared.height,
      thumbnailVersion: version,
      mediaVersion: version,
      thumbnailFramed: true,
      publishedImage: true,
    };
    delete photo.galleryCrop;
    delete photo.galleryZoom;
    const catalogs = structuredClone(current.catalogs);
    catalogs.photography.photos = existing
      ? photos.map((item) => (item.file === existing!.file ? photo : item))
      : [...photos, photo];
    catalogs.photography.photoTags = [
      ...new Set([...catalogs.photography.photoTags, ...tags]),
    ];
    validateCatalogs(catalogs);
    await this.validatePhotos(
      workspaceId,
      catalogs.photography.photos,
      relative,
    );
    const changes = await this.contentChanges(
      workspaceId,
      revision,
      catalogs,
      current.catalogs,
    );
    changes.unshift({
      relative,
      bytes: prepared.bytes,
      expected: await fileDigest(filename),
    });
    if (
      existing?.publishedImage &&
      existing.thumbnail &&
      existing.thumbnail !== thumbnail
    ) {
      const previous = `photography/thumbnails/${existing.thumbnail}`;
      const previousPath = await workspaceFile(root, previous);
      if (
        (await isSavedOriginal(
          this.directory,
          previousPath,
          this.processing.originalFiles(),
        )) ||
        (await publicReferences(root, previous)).length
      )
        throw new Error(
          "The previous Published Image is referenced elsewhere or is an original. Update those references before changing its output format.",
        );
      changes.unshift({
        relative: previous,
        bytes: null,
        expected: await fileDigest(previousPath),
      });
    }
    const sourceRelative = `workspaces/${workspaceId}/sources/${digest(photo.file)}.json`;
    const sourcePath = await workspaceFile(this.directory, sourceRelative);
    changes.unshift({
      relative: sourceRelative,
      private: true,
      bytes: Buffer.from(
        jsonFile({
          version: 1,
          photoKey: photo.file,
          workspaceId,
          originalPath: await realpath(prepared.originalPath),
          recipe: prepared.recipe,
        }),
      ),
      expected: await fileDigest(sourcePath),
    });
    await this.transactions.commit(
      workspaceId,
      revision,
      `Publish ${photo.file}`,
      changes,
    );
    this.processing.discard(request.token);
    return {
      workspace: await this.registry.read(workspaceId),
      photoKey: photo.file,
      skipped: false,
    };
  }
}
