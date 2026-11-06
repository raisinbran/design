import { realpath, stat } from "node:fs/promises";
import path from "node:path";

const IMAGE_FOLDERS = ["photography/thumbnails", "photography/published", "images"];
const IMAGE_FILE = /\.(jpe?g|png|webp|gif)$/i;

/**
 * Returns the image file that a `portfolio://site/<path>` URL names, or null.
 * The file must have an image extension and lie, after following symlinks, inside one of IMAGE_FOLDERS.
 */
export async function resolveSiteImage(folder: string, url: string): Promise<string | null> {
  const { host, pathname } = new URL(url);
  if (host !== "site") return null;
  try {
    const relative = decodeURIComponent(pathname.slice(1));
    if (!IMAGE_FILE.test(relative)) return null;
    const file = await realpath(path.resolve(folder, relative));
    for (const name of IMAGE_FOLDERS) {
      const allowed = await realpath(path.join(folder, name)).catch(() => null);
      if (allowed && file.startsWith(allowed + path.sep) && (await stat(file)).isFile())
        return file;
    }
    return null;
  } catch {
    return null;
  }
}
