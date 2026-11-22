import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

export type PublicationDirectory = "thumbnails" | "published";

/** Reject site image directories that are links or resolve outside the chosen repository. */
export async function siteImageRoot(
  folder: string,
  components: readonly string[],
): Promise<string | null> {
  try {
    let current = await realpath(folder);
    for (const component of components) {
      current = path.join(current, component);
      const entry = await lstat(current);
      if (!entry.isDirectory() || entry.isSymbolicLink()) return null;
      if ((await realpath(current)) !== current) return null;
    }
    return current;
  } catch {
    return null;
  }
}

export function publicationRoot(
  folder: string,
  directory: PublicationDirectory,
): Promise<string | null> {
  return siteImageRoot(folder, ["photography", directory]);
}
