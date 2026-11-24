import { constants } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ImportedMedia, MediaSection } from "../api/api";

const IMAGE = /\.(jpe?g|png|webp|tiff?|heic|heif|avif)$/i;
const VIDEO = /\.(mp4|webm)$/i;
const OWNER_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** The file types the open dialog offers for a section; only Engineering takes video. */
export const MEDIA_EXTENSIONS: Record<MediaSection, string[]> = {
  engineering: ["jpg", "jpeg", "png", "webp", "tif", "tiff", "heic", "heif", "avif", "mp4", "webm"],
  archive: ["jpg", "jpeg", "png", "webp", "tif", "tiff", "heic", "heif", "avif"],
};

/**
 * Puts each chosen file under the site, in `images/<owner>/` (re-encoded by `encode` with the same
 * rules as photos) or `video/<owner>/` (copied as is), and returns the paths for the catalog. A
 * name already taken by different bytes gets a numbered name; the same bytes reuse the old file.
 * Nothing is ever deleted, and the chosen originals are only read.
 */
export async function importMedia(
  folder: string,
  section: MediaSection,
  ownerId: string,
  files: string[],
  encode: (file: string) => Promise<Uint8Array>,
): Promise<ImportedMedia[]> {
  if (!OWNER_ID.test(ownerId)) throw new Error(`"${ownerId}" is not a valid ${section} id`);
  const imported: ImportedMedia[] = [];
  for (const file of files) {
    const name = path
      .parse(file)
      .name.replace(/[\\/<>:"|?*\x00-\x1f]/g, "_")
      .replace(/[. ]+$/, "");
    if (IMAGE.test(file)) {
      const src = await place(
        folder,
        `images/${ownerId}`,
        name || "image",
        "webp",
        await encode(file),
      );
      imported.push({ kind: "image", src });
    } else if (VIDEO.test(file) && section === "engineering") {
      const extension = path.extname(file).slice(1).toLowerCase();
      const src = await place(folder, `video/${ownerId}`, name || "video", extension, file);
      imported.push({ kind: "video", src });
    } else {
      throw new Error(`${path.basename(file)} is not a file type this ${section} page can use`);
    }
  }
  return imported;
}

/** Writes bytes, or copies a source file, to the first free `<name>[-n].<extension>`. */
async function place(
  folder: string,
  directory: string,
  name: string,
  extension: string,
  content: Uint8Array | string,
): Promise<string> {
  await mkdir(path.join(folder, directory), { recursive: true });
  for (let number = 1; ; number++) {
    const filename = `${name}${number === 1 ? "" : `-${number}`}.${extension}`;
    const destination = path.join(folder, directory, filename);
    try {
      if (typeof content === "string")
        await copyFile(content, destination, constants.COPYFILE_EXCL);
      else await writeFile(destination, content, { flag: "wx" });
      return `${directory}/${filename}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const bytes = typeof content === "string" ? await readFile(content) : content;
      if (Buffer.from(bytes).equals(await readFile(destination))) return `${directory}/${filename}`;
    }
  }
}
