import { readFile, readdir, lstat } from "node:fs/promises";
import path from "node:path";
import { WorkspaceRegistry, workspaceFile, digest } from "./files";
import { Transactions, fileDigest } from "./transactions";
import { photographyScript, jsonFile } from "./site-content";
export interface MigrationPhoto {
  photoKey: string;
  fullSize: string;
  references: string[];
  canCleanup: boolean;
  migrated: boolean;
  reason?: string;
}
/** Examine public source files only; never traverse app dependencies, private data, or symlinks. */
export async function publicReferences(
  root: string,
  relative: string,
): Promise<string[]> {
  const references: string[] = [];
  const name = path.basename(relative);
  const scan = async (directory: string) => {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (
        item.name.startsWith(".") ||
        ["tools", "node_modules", "_site", "docs"].includes(item.name)
      )
        continue;
      const filename = path.join(directory, item.name);
      const rel = path.relative(root, filename).split(path.sep).join("/");
      if (item.isSymbolicLink()) continue;
      if (item.isDirectory()) {
        await scan(filename);
        continue;
      }
      if (
        !/\.(?:html?|js|css|json|xml|txt|md)$/i.test(item.name) ||
        ["data/media-catalog.json", "js/photography-catalog.js"].includes(rel)
      )
        continue;
      if ((await lstat(filename)).size > 5 * 1024 * 1024) continue;
      const content = await readFile(filename, "utf8");
      if (
        content.includes(relative) ||
        content.includes(encodeURI(relative)) ||
        content.includes(name) ||
        content.includes(encodeURIComponent(name))
      )
        references.push(rel);
    }
  };
  await scan(root);
  return references;
}
export async function isSavedOriginal(
  directory: string,
  filename: string,
  active: Iterable<string> = [],
): Promise<boolean> {
  const canonical = async (value: string) => {
    try {
      return await import("node:fs/promises").then((fs) => fs.realpath(value));
    } catch {
      return path.resolve(value);
    }
  };
  const target = await canonical(filename);
  const same = async (value: string) => {
    const candidate = await canonical(value);
    return process.platform === "win32"
      ? candidate.toLowerCase() === target.toLowerCase()
      : candidate === target;
  };
  for (const original of active) if (await same(original)) return true;
  const workspaces = path.join(directory, "workspaces");
  let identities: string[];
  try {
    identities = await readdir(workspaces);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  for (const id of identities.filter((id) => /^[a-f0-9]{64}$/.test(id))) {
    const sourceFolder = path.join(workspaces, id, "sources");
    let sources: string[];
    try {
      sources = await readdir(sourceFolder);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    for (const name of sources.filter((name) =>
      /^[a-f0-9]{64}\.json$/.test(name),
    )) {
      const record = JSON.parse(
        await readFile(path.join(sourceFolder, name), "utf8"),
      );
      if (
        typeof record.originalPath === "string" &&
        (await same(record.originalPath))
      )
        return true;
    }
  }
  return false;
}
export class LegacyMigration {
  constructor(
    private directory: string,
    private registry: WorkspaceRegistry,
    private transactions: Transactions,
    private activeOriginals: Map<string, string> = new Map(),
  ) {}
  async review(workspaceId: string): Promise<MigrationPhoto[]> {
    const workspace = await this.registry.read(workspaceId);
    const root = this.registry.root(workspaceId);
    return Promise.all(
      workspace.catalogs.photography.photos
        .filter((photo) => photo.thumbnail)
        .map(async (photo) => {
          const fullSize = `photography/published/${photo.file}`;
          const references = await publicReferences(root, fullSize);
          const exists =
            (await fileDigest(await workspaceFile(root, fullSize))) !== null;
          const sourceUsesFile = await isSavedOriginal(
            this.directory,
            path.join(root, fullSize),
            this.activeOriginals.values(),
          );
          return {
            photoKey: photo.file,
            fullSize,
            references,
            migrated: photo.publishedImage === true,
            canCleanup:
              exists &&
              photo.publishedImage === true &&
              references.length === 0 &&
              !sourceUsesFile,
            reason: sourceUsesFile
              ? "This file is a saved original; relink an external original before cleanup."
              : !exists
                ? "No full-size file exists."
                : references.length
                  ? "Update these references before cleanup."
                  : undefined,
          };
        }),
    );
  }
  async migrate(
    workspaceId: string,
    revision: string,
    keys: string[],
  ): Promise<void> {
    const workspace = await this.registry.read(workspaceId);
    if (workspace.revision !== revision)
      throw new Error("Refresh the migration review before applying changes.");
    const photography = structuredClone(workspace.catalogs.photography);
    for (const key of keys) {
      const photo = photography.photos.find((item) => item.file === key);
      if (!photo?.thumbnail)
        throw new Error("Migration requires an existing Published Image.");
      photo.publishedImage = true;
    }
    const expected = this.registry.baseline(workspaceId, revision);
    await this.transactions.commit(
      workspaceId,
      revision,
      "Migrate Legacy Photo References (Keep Full-Size Files)",
      [
        {
          relative: "data/media-catalog.json",
          bytes: Buffer.from(jsonFile(photography)),
          expected: expected["data/media-catalog.json"],
        },
        {
          relative: "js/photography-catalog.js",
          bytes: Buffer.from(photographyScript(photography)),
          expected: expected["js/photography-catalog.js"],
        },
      ],
    );
  }
  async cleanup(
    workspaceId: string,
    revision: string,
    keys: string[],
  ): Promise<void> {
    const review = await this.review(workspaceId);
    const changes = [];
    for (const key of keys) {
      const photo = review.find((item) => item.photoKey === key);
      if (!photo?.canCleanup)
        throw new Error(
          `Cleanup is blocked for ${key}. Review references and saved originals.`,
        );
      changes.push({
        relative: photo.fullSize,
        bytes: null,
        expected: await fileDigest(
          await workspaceFile(this.registry.root(workspaceId), photo.fullSize),
        ),
      });
    }
    await this.transactions.commit(
      workspaceId,
      revision,
      "Reviewed Legacy Full-Size Cleanup",
      changes,
    );
  }
}
