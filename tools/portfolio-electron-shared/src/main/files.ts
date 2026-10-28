import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import type { WorkspaceView } from "../contracts";
import { validateCatalogs } from "../validation";
export function digest(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
/** Refuse symlinks and traversal before giving a scoped service a workspace file. */
export async function workspaceFile(
  root: string,
  relative: string,
): Promise<string> {
  const candidate = path.resolve(root, relative);
  if (!candidate.startsWith(root + path.sep))
    throw new Error("File must be inside the selected portfolio");
  let current = root;
  for (const part of path.relative(root, candidate).split(path.sep)) {
    current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error("Symbolic links are not supported for workspace files");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return candidate;
}
/** Atomic private-state save. Public multi-file transactions are implemented separately. */
export async function atomicWrite(
  filename: string,
  bytes: string | Uint8Array,
): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const staged = `${filename}.${randomUUID()}.staged`;
  try {
    const file = await open(staged, "wx", 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(staged, filename);
  } finally {
    await rm(staged, { force: true });
  }
}
export class WorkspaceRegistry {
  private roots = new Map<string, string>();
  private catalogSnapshots = new Map<string, WorkspaceView["catalogs"]>();
  private snapshots = new Map<string, Record<string, string | null>>();
  baseline(id: string, revision: string): Record<string, string | null> {
    this.root(id);
    const snapshot = this.snapshots.get(`${id}:${revision}`);
    if (!snapshot) throw new Error("Reload this portfolio before saving.");
    return { ...snapshot };
  }
  baselineCatalogs(id: string, revision: string): WorkspaceView["catalogs"] {
    const catalogs = this.catalogSnapshots.get(`${id}:${revision}`);
    if (!catalogs) throw new Error("Reload before reconciling.");
    return structuredClone(catalogs);
  }
  async select(directory: string): Promise<WorkspaceView> {
    const root = await realpath(directory);
    const id = digest(root);
    this.roots.set(id, root);
    try {
      return await this.read(id);
    } catch (error) {
      this.roots.delete(id);
      throw error;
    }
  }
  root(id: string): string {
    if (typeof id !== "string" || !this.roots.has(id))
      throw new Error("Select a portfolio folder first");
    return this.roots.get(id)!;
  }
  async read(id: string): Promise<WorkspaceView> {
    const root = this.root(id);
    const names = ["media", "engineering", "archive"];
    const contents = await Promise.all(
      names.map(async (name) =>
        readFile(
          await workspaceFile(root, `data/${name}-catalog.json`),
          "utf8",
        ),
      ),
    );
    const catalogs = validateCatalogs({
      photography: JSON.parse(contents[0]),
      engineering: JSON.parse(contents[1]),
      archive: JSON.parse(contents[2]),
    });
    const tracked = [
      "data/media-catalog.json",
      "data/engineering-catalog.json",
      "data/archive-catalog.json",
      "js/photography-catalog.js",
      "engineeringdesign.html",
      "creativedesign.html",
      "js/archive-photo-settings.js",
    ];
    const hashes: Record<string, string | null> = {};
    for (const relative of tracked) {
      try {
        hashes[relative] = digest(
          await readFile(await workspaceFile(root, relative)),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        hashes[relative] = null;
      }
    }
    for (const [index, name] of names.entries())
      if (hashes[`data/${name}-catalog.json`] !== digest(contents[index]))
        throw new Error(
          "Catalog changed while opening. Refresh and try again.",
        );
    const revision = digest(JSON.stringify(hashes));
    this.snapshots.set(`${id}:${revision}`, hashes);
    this.catalogSnapshots.set(`${id}:${revision}`, structuredClone(catalogs));
    return { id, name: path.basename(root), catalogs, revision };
  }
}
