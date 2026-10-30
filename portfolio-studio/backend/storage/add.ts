import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Added, AddRequest, PortfolioView, Result } from "../api/api";
import { loadPortfolio, savePortfolio } from "./portfolio";

type Photo = PortfolioView["catalogs"]["photography"]["photos"][number];

// Names that work as file names on Linux, Windows and macOS.
const UNSAFE_NAME = /[\\/<>:"|?*\x00-\x1f]|^\.\.?$|[. ]$/;
// Windows refuses these device names as files, even with an extension, such as "nul.jpg".
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Writes `image` as a photo's gallery image and saves the catalog and the photography script.
 * A new photo named like an existing one, ignoring case, returns "name-conflict" and writes
 * nothing, unless the request says to overwrite.
 */
export async function addPhoto(
  folder: string,
  request: AddRequest,
  image: { bytes: Uint8Array; width: number; height: number },
): Promise<Result<Added>> {
  const { catalogs } = await loadPortfolio(folder);
  const photos = catalogs.photography.photos;
  const key = (request.kind === "new" ? request.name : request.photoKey).trim();
  if (!key || UNSAFE_NAME.test(key) || key.length > 200) {
    return { ok: false, error: { code: "invalid", message: `"${key}" cannot be a file name` } };
  }
  if (RESERVED_NAME.test(key)) {
    const message = `"${key}" is a device name that Windows reserves; choose another name`;
    return { ok: false, error: { code: "invalid", message } };
  }
  const existing = photos.find((photo) => photo.file.toLowerCase() === key.toLowerCase());
  if (request.kind === "replace" && !existing) {
    return { ok: false, error: { code: "invalid", message: `${key} is no longer in the catalog` } };
  }
  const thumbnail = existing?.thumbnail ?? `${existing?.file ?? key}.webp`;
  if (
    request.kind === "new" &&
    !request.overwrite &&
    (existing || existsSync(path.join(folder, "photography/thumbnails", thumbnail)))
  ) {
    const message = `A photo named ${key} already exists. Overwrite or Cancel?`;
    return { ok: false, error: { code: "name-conflict", message } };
  }

  // A gallery image gives the photo its shape, so the fields kept for photos without one go.
  const { aspectRatio: _ratio, mediaVersion: _version, ...kept } = existing ?? {};
  const photo: Photo = {
    file: existing?.file ?? key,
    visible: true,
    displayPriority: "normal",
    ...kept,
    alt: request.kind === "new" ? request.alt : existing!.alt,
    tags: request.kind === "new" ? request.tags : existing!.tags,
    thumbnail,
    thumbnailVersion: createHash("sha256").update(image.bytes).digest("hex").slice(0, 12),
    thumbnailWidth: image.width,
    thumbnailHeight: image.height,
  };
  const photography = {
    ...catalogs.photography,
    // A new tag goes to the end of photoTags, which is also the order of the site's filter chips.
    photoTags: [
      ...catalogs.photography.photoTags,
      ...photo.tags.filter((tag) => !catalogs.photography.photoTags.includes(tag)),
    ],
    photos: existing
      ? photos.map((item) => (item === existing ? photo : item))
      : [...photos, photo],
  };
  const saved = await savePortfolio(
    folder,
    request.revision,
    { ...catalogs, photography },
    { [`photography/thumbnails/${thumbnail}`]: image.bytes },
  );
  return saved.ok ? { ok: true, value: { view: saved.value, photoKey: photo.file } } : saved;
}
