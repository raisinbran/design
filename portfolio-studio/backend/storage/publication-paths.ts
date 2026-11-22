import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

export type PublicationDirectory = "thumbnails" | "published";

/** Do not follow publication-directory symlinks into private files or another checkout. */
export async function publicationRoot(
  folder: string,
  directory: PublicationDirectory,
): Promise<string | null> {
  try {
    const repositoryRoot = await realpath(folder);
    const photographyRoot = path.join(repositoryRoot, "photography");
    const outputRoot = path.join(photographyRoot, directory);
    for (const candidate of [photographyRoot, outputRoot]) {
      const entry = await lstat(candidate);
      if (!entry.isDirectory() || entry.isSymbolicLink()) return null;
      if ((await realpath(candidate)) !== candidate) return null;
    }
    return outputRoot;
  } catch {
    return null;
  }
}
