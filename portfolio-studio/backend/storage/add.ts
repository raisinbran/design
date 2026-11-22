import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Added, AddRequest, PortfolioView, Result } from "../api/api";
import { photoNameProblem, webpName } from "./names";
import {
  fileOutputFormat,
  isPhotoOutputFormat,
  photoBaseNameProblem,
  publishedFilename,
  type PhotoOutputFormat,
} from "../../shared/photo-format";
import { loadPortfolio, savePortfolio } from "./portfolio";

type Photo = PortfolioView["catalogs"]["photography"]["photos"][number];

/**
 * Writes `image` as a photo's gallery image and saves the catalog and the photography script.
 * A new photo named like an existing one, ignoring case, returns "name-conflict" and writes
 * nothing, unless the request says to overwrite.
 */
export async function addPhoto(
  folder: string,
  request: AddRequest,
  image: { bytes: Uint8Array; width: number; height: number; format?: PhotoOutputFormat },
): Promise<Result<Added>> {
  if (request.kind === "new" && !isPhotoOutputFormat(request.format)) {
    return {
      ok: false,
      error: { code: "invalid", message: "Select a supported output format" },
    };
  }
  const { catalogs } = await loadPortfolio(folder);
  const photos = catalogs.photography.photos;
  const bareName = request.kind === "new" ? request.name.trim() : null;
  const problem =
    request.kind === "new"
      ? photoBaseNameProblem(bareName!)
      : photoNameProblem(request.photoKey.trim());
  if (problem) return { ok: false, error: { code: "invalid", message: problem } };
  const key =
    request.kind === "new" ? publishedFilename(bareName!, request.format) : request.photoKey.trim();
  const existing = photos.find((photo) => photo.file.toLowerCase() === key.toLowerCase());
  if (request.kind === "replace" && !existing) {
    return { ok: false, error: { code: "invalid", message: `${key} is no longer in the catalog` } };
  }
  // An overwrite must not put JPEG or PNG bytes into a historic WebP thumbnail.
  const expected =
    request.kind === "new"
      ? request.format
      : (fileOutputFormat(existing?.thumbnail ?? "") ?? "webp");
  if (image.format && image.format !== expected) {
    return {
      ok: false,
      error: { code: "invalid", message: "Rendered bytes do not match the selected output format" },
    };
  }
  if (
    request.kind === "new" &&
    existing?.thumbnail &&
    fileOutputFormat(existing.thumbnail) !== request.format
  ) {
    return {
      ok: false,
      error: {
        code: "name-conflict",
        message:
          "This existing photo uses a different published format. Use Edit Image or a new name.",
      },
    };
  }
  const thumbnail =
    request.kind === "new"
      ? publishedFilename(bareName!, request.format)
      : (existing?.thumbnail ?? webpName(key));
  const competingThumbnail = photos.find(
    (photo) => photo !== existing && photo.thumbnail?.toLowerCase() === thumbnail.toLowerCase(),
  );
  if (
    request.kind === "new" &&
    !request.overwrite &&
    (existing ||
      competingThumbnail ||
      existsSync(path.join(folder, "photography/thumbnails", thumbnail)))
  ) {
    const message = `A photo named ${key} already exists. Overwrite or Cancel?`;
    return { ok: false, error: { code: "name-conflict", message } };
  }

  if (competingThumbnail) {
    return {
      ok: false,
      error: {
        code: "name-conflict",
        message: `The published filename ${thumbnail} is already in use`,
      },
    };
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
