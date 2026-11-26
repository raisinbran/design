import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Added, AddRequest, Page, PortfolioView, Result } from "../api/api";
import { photoNameProblem, webpName } from "./names";
import {
  fileOutputFormat,
  isPhotoOutputFormat,
  photoBaseNameProblem,
  publishedFilename,
  type PhotoOutputFormat,
} from "../../shared/photo-format";
import { describeUses, moveItem, photoSrc, repointUses } from "../../shared/library";
import { loadPortfolio, savePortfolio } from "./portfolio";

/** Where a photo added from the Photo Editor is published. */
const PHOTO_FOLDER = "images/Photography";

type Photo = PortfolioView["catalogs"]["photography"]["photos"][number];

// "images/Cat/a.jpg" becomes "images/Cat/a-edit.jpg", numbered when that name is taken.
function editedPath(folder: string, source: string, catalogs: PortfolioView["catalogs"]): string {
  const { dir, name, ext } = path.posix.parse(source);
  const taken = (candidate: string) =>
    existsSync(path.join(folder, candidate)) ||
    catalogs.library.items.some((item) => item.src.toLowerCase() === candidate.toLowerCase());
  let candidate = `${dir}/${name}-edit${ext}`;
  for (let n = 2; taken(candidate); n++) candidate = `${dir}/${name}-edit${n}${ext}`;
  return candidate;
}

// The file's library item with the requested pages; saving adds the page of any use it has.
function withPages(
  library: PortfolioView["catalogs"]["library"],
  src: string,
  pages: Page[],
  request: AddRequest,
  photoFile: string,
): PortfolioView["catalogs"]["library"] {
  if (request.kind !== "new") return library;
  const rest = library.items.filter((item) => item.src !== src);
  const kept = library.items.find((item) => item.src === src);
  const item = {
    ...kept,
    src,
    pages: pages.filter((page, at) => pages.indexOf(page) === at),
    ...(pages.includes("photography") ? { photoFile } : {}),
    ...(pages.includes("photography") ? {} : { alt: request.alt }),
  };
  return { ...library, items: [...rest, item] };
}

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
  const pages: Page[] =
    request.kind === "new" ? (request.pages ?? ["photography"]) : ["photography"];
  const inPhotography = pages.includes("photography");
  if (pages.length === 0) {
    return { ok: false, error: { code: "invalid", message: "Choose a page" } };
  }
  const bareName = request.kind === "new" ? request.name.trim() : null;
  const problem =
    request.kind === "new"
      ? photoBaseNameProblem(bareName!)
      : photoNameProblem(request.photoKey.trim());
  if (problem) return { ok: false, error: { code: "invalid", message: problem } };
  const key =
    request.kind === "new" ? publishedFilename(bareName!, request.format) : request.photoKey.trim();
  const existing = photos.find((photo) => photo.file.toLowerCase() === key.toLowerCase());
  if (request.kind === "new" && existing && !inPhotography) {
    return {
      ok: false,
      error: { code: "invalid", message: `${key} is already in Photography` },
    };
  }
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
  const previous = existing ? photoSrc(existing) : "";
  // Editing a photo that another page also shows writes a new file beside the old one, so every
  // page follows the edit and no page is left pointing at bytes that changed under it.
  const shared =
    request.kind === "replace" &&
    !!existing?.thumbnail?.includes("/") &&
    describeUses(catalogs, previous, "photography") !== "";
  const thumbnail = shared
    ? editedPath(folder, previous, catalogs)
    : request.kind === "new"
      ? `${PHOTO_FOLDER}/${publishedFilename(bareName!, request.format)}`
      : (existing?.thumbnail ?? webpName(key));
  // A bare name lives in photography/thumbnails/ (older photos); a path names its own place.
  const destination = photoSrc({ file: key, thumbnail });
  const competingThumbnail = photos.find(
    (photo) => photo !== existing && photoSrc(photo).toLowerCase() === destination.toLowerCase(),
  );
  if (
    request.kind === "new" &&
    !request.overwrite &&
    (existing ||
      competingThumbnail ||
      existsSync(path.join(folder, destination)) ||
      catalogs.library.items.some((item) => item.src.toLowerCase() === destination.toLowerCase()))
  ) {
    const message = `A photo named ${key} already exists. Overwrite or Cancel?`;
    return { ok: false, error: { code: "name-conflict", message } };
  }

  // Overwriting a name that another photo already publishes under replaces that photo's image.
  const target =
    existing ??
    (request.kind === "new" && request.overwrite && inPhotography ? competingThumbnail : undefined);
  if (competingThumbnail && competingThumbnail !== target) {
    return {
      ok: false,
      error: {
        code: "name-conflict",
        message: `The published filename ${thumbnail} is already in use`,
      },
    };
  }

  // A gallery image gives the photo its shape, so the fields kept for photos without one go.
  const { aspectRatio: _ratio, mediaVersion: _version, ...kept } = target ?? {};
  const photo: Photo = {
    file: target?.file ?? key,
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
    photos: target ? photos.map((item) => (item === target ? photo : item)) : [...photos, photo],
  };
  const edited = {
    ...(inPhotography ? { ...catalogs, photography } : catalogs),
    library: withPages(catalogs.library, destination, pages, request, photo.file),
  };
  const saved = await savePortfolio(
    folder,
    request.revision,
    shared ? moveItem(repointUses(edited, previous, destination), previous, destination) : edited,
    { [destination]: image.bytes },
  );
  return saved.ok ? { ok: true, value: { view: saved.value, photoKey: photo.file } } : saved;
}
