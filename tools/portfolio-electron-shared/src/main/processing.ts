import { randomUUID } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { EditRecipe } from "../models";
import type { RenderPreview, ProcessingDraft } from "../contracts";
import type {
  RenderedImage,
  ProcessingStage,
} from "../processing/render-image";
import { validateRecipe } from "../processing/recipe";
import { atomicWrite, digest } from "./files";

export interface PreparedPublication extends RenderedImage {
  sourceId: string;
  originalPath: string;
  recipe: EditRecipe;
  token: string;
  createdAt: number;
}
export type RenderWorker = (
  request: unknown,
  onProgress: (stage: ProcessingStage) => void,
  signal: AbortSignal,
) => Promise<RenderedImage>;
/** Exact encoded bytes stay private until the transaction service consumes a matching token. */
export class ProcessingService {
  private prepared = new Map<string, PreparedPublication>();
  private running = new Map<string, AbortController>();
  private bytesHeld = 0;
  constructor(
    private originals: Map<string, string>,
    private directory: string,
    private worker: RenderWorker,
  ) {}
  originalFiles(): Iterable<string> {
    return this.originals.values();
  }
  async render(
    sourceId: string,
    input: unknown,
    report: (stage: ProcessingStage) => void,
  ): Promise<RenderPreview> {
    const originalPath = this.originals.get(sourceId);
    if (!originalPath) throw new Error("Import or relink the original first");
    if (this.running.size)
      throw new Error(
        "Another photograph is processing. Cancel it or wait for completion.",
      );
    const recipe = validateRecipe(input);
    const controller = new AbortController();
    this.running.set(sourceId, controller);
    try {
      const image = await this.worker(
        { action: "render", originalPath, recipe },
        report,
        controller.signal,
      );
      if (controller.signal.aborted) throw new Error("Processing cancelled");
      this.discardSource(sourceId);
      const token = randomUUID();
      const result = {
        ...image,
        sourceId,
        originalPath,
        recipe,
        token,
        createdAt: Date.now(),
      };
      this.prepared.set(token, result);
      this.bytesHeld += image.bytes.byteLength;
      // Bound batch memory. Evicted entries must be rendered again before publication.
      while (this.bytesHeld > 192 * 1024 * 1024 && this.prepared.size > 1)
        this.discard(this.prepared.keys().next().value!);
      return {
        token,
        sourceId,
        recipeDigest: digest(JSON.stringify(recipe)),
        width: image.width,
        height: image.height,
        format: image.format,
        byteLength: image.bytes.byteLength,
        dataUrl: `data:image/${image.format};base64,${Buffer.from(image.bytes).toString("base64")}`,
      };
    } finally {
      this.running.delete(sourceId);
    }
  }
  cancel(sourceId: string): void {
    this.running.get(sourceId)?.abort();
  }
  discard(token: string): void {
    const image = this.prepared.get(token);
    if (image) this.bytesHeld -= image.bytes.byteLength;
    this.prepared.delete(token);
  }
  discardSource(sourceId: string): void {
    for (const [token, image] of this.prepared)
      if (image.sourceId === sourceId) this.discard(token);
  }
  /** Publication rechecks the original hash; source edits after preview require a new render. */
  async publication(
    token: string,
    sourceId: string,
    input: unknown,
  ): Promise<PreparedPublication> {
    const recipe = validateRecipe(input);
    const image = this.prepared.get(token);
    if (
      !image ||
      image.sourceId !== sourceId ||
      JSON.stringify(image.recipe) !== JSON.stringify(recipe)
    )
      throw new Error(
        "Published Image preview is stale. Render the current recipe again.",
      );
    let bytes: Buffer;
    try {
      bytes = await readFile(image.originalPath);
    } catch {
      throw new Error("Original is unavailable. Relink before publication.");
    }
    if (digest(bytes) !== image.sourceDigest)
      throw new Error(
        "Original changed after preview. Render it again before publishing.",
      );
    return image;
  }
  async saveDefaults(input: unknown): Promise<EditRecipe> {
    const recipe = validateRecipe(input);
    await atomicWrite(
      path.join(this.directory, "processing-defaults.json"),
      JSON.stringify(recipe),
    );
    return recipe;
  }
  async defaults(): Promise<EditRecipe | null> {
    try {
      return validateRecipe(
        JSON.parse(
          await readFile(
            path.join(this.directory, "processing-defaults.json"),
            "utf8",
          ),
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  async saveDraft(sourceId: string, input: unknown): Promise<void> {
    const originalPath = this.originals.get(sourceId);
    if (!originalPath) throw new Error("Import or relink the original first");
    if (!/^[a-f0-9-]{36}$/.test(sourceId))
      throw new Error("Invalid source identity");
    await atomicWrite(
      path.join(this.directory, "drafts", `${sourceId}.json`),
      JSON.stringify({
        version: 1,
        originalPath,
        recipe: validateRecipe(input),
      }),
    );
  }
  async drafts(): Promise<ProcessingDraft[]> {
    const directory = path.join(this.directory, "drafts");
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const drafts: ProcessingDraft[] = [];
    for (const name of names.filter((name) =>
      /^[a-f0-9-]{36}\.json$/.test(name),
    )) {
      const saved = JSON.parse(
        await readFile(path.join(directory, name), "utf8"),
      ) as { version: number; originalPath: string; recipe: unknown };
      if (
        saved.version !== 1 ||
        typeof saved.originalPath !== "string" ||
        !path.isAbsolute(saved.originalPath)
      )
        throw new Error("A private processing draft is invalid");
      const id = name.slice(0, -5);
      let needsRelink = false;
      try {
        await access(saved.originalPath);
        this.originals.set(id, saved.originalPath);
      } catch {
        needsRelink = true;
      }
      drafts.push({
        id,
        name: path.basename(saved.originalPath),
        recipe: validateRecipe(saved.recipe),
        needsRelink,
      });
    }
    return drafts;
  }
}
