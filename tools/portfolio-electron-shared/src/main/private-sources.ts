import path from "node:path";
import { readFile, realpath } from "node:fs/promises";
import { digest, atomicWrite } from "./files";
import type { PrivatePhotoSource } from "../models";
/** Sources are shared privately by workspace and stable photo identity, never in website files. */
export class PrivateSourceStore {
  constructor(private readonly directory: string) {}
  private filename(workspaceId: string, photoKey: string): string {
    if (
      !/^[a-f0-9]{64}$/.test(workspaceId) ||
      !photoKey ||
      photoKey.length > 1024
    )
      throw new Error("Invalid private source identity");
    return path.join(
      this.directory,
      "workspaces",
      workspaceId,
      "sources",
      `${digest(photoKey)}.json`,
    );
  }
  async read(
    workspaceId: string,
    photoKey: string,
  ): Promise<PrivatePhotoSource | null> {
    try {
      const source = JSON.parse(
        await readFile(this.filename(workspaceId, photoKey), "utf8"),
      ) as PrivatePhotoSource;
      if (
        source.version !== 1 ||
        source.workspaceId !== workspaceId ||
        source.photoKey !== photoKey ||
        typeof source.originalPath !== "string"
      )
        throw new Error("Invalid saved source reference");
      return source;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  async write(source: PrivatePhotoSource): Promise<void> {
    const originalPath = await realpath(source.originalPath);
    await atomicWrite(
      this.filename(source.workspaceId, source.photoKey),
      JSON.stringify({ ...source, originalPath }, null, 2),
    );
  }
}
