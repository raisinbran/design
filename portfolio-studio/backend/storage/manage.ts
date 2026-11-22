import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { PhotoChange, PortfolioView, Result, Revision } from "../api/api";
import { photoNameProblem, webpName } from "./names";
import { loadPortfolio, savePortfolio } from "./portfolio";

type Photo = PortfolioView["catalogs"]["photography"]["photos"][number];
type TrashFile = (file: string) => Promise<void>;

const error = (code: "invalid" | "name-conflict", message: string): Result<PhotoChange> => ({
  ok: false,
  error: { code, message },
});

// Only site derivatives inside the two publication folders may be moved to Trash.
// Even a malicious catalog entry or a symlink cannot point this operation at a private original.
async function assetPath(
  folder: string,
  directory: "thumbnails" | "published",
  filename: string,
): Promise<string | null> {
  if (path.basename(filename) !== filename || filename === "." || filename === "..") return null;
  const root = await realpath(path.join(folder, "photography", directory));
  const target = path.join(root, filename);
  const info = await lstat(target).catch(() => null);
  if (!info?.isFile() || info.isSymbolicLink()) return null;
  const resolved = await realpath(target);
  return path.dirname(resolved) === root ? resolved : null;
}

function referencedElsewhere(photos: Photo[], current: Photo, file: string): boolean {
  return photos.some(
    (photo) => photo !== current && (photo.thumbnail === file || photo.file === file),
  );
}

async function trashUnused(paths: string[], trash: TrashFile): Promise<string | undefined> {
  const failures: string[] = [];
  for (const file of paths) {
    try {
      await trash(file);
    } catch {
      failures.push(path.basename(file));
    }
  }
  return failures.length
    ? `Changes saved, but these old site files could not be moved to Trash: ${failures.join(", ")}. Remove them from GitHub Desktop before publishing.`
    : undefined;
}

/** Rename a catalog key and its actual published derivative without touching the private original. */
export async function renamePhoto(
  folder: string,
  revision: Revision,
  oldName: string,
  newName: string,
  trash: TrashFile,
): Promise<Result<PhotoChange>> {
  const problem = photoNameProblem(newName);
  if (problem) return error("invalid", problem);
  const view = await loadPortfolio(folder);
  const original = view.catalogs.photography.photos.find((photo) => photo.file === oldName);
  if (!original) return error("invalid", `Photo "${oldName}" is no longer in the catalog`);
  if (oldName === newName) return { ok: true, value: { view } };
  const photos = view.catalogs.photography.photos;
  if (
    photos.some((photo) => photo !== original && photo.file.toLowerCase() === newName.toLowerCase())
  ) {
    return error("name-conflict", `A photo already uses "${newName}"`);
  }
  if (
    !original.thumbnail &&
    path.extname(oldName).toLowerCase() !== path.extname(newName).toLowerCase()
  ) {
    return error(
      "invalid",
      "A legacy published image can only be renamed without changing its file format",
    );
  }

  const directory = original.thumbnail ? "thumbnails" : "published";
  const oldFile = original.thumbnail ?? oldName;
  const nextFile = original.thumbnail ? webpName(newName) : newName;
  const collision = await assetPath(folder, directory, nextFile);
  const oldPath = await assetPath(folder, directory, oldFile);
  if (!oldPath) return error("invalid", `The site image for "${oldName}" is missing`);
  if (collision && collision !== oldPath) {
    return error("name-conflict", `The published image "${nextFile}" already exists`);
  }
  if (
    photos.some(
      (photo) =>
        photo !== original &&
        (photo.thumbnail ?? photo.file).toLowerCase() === nextFile.toLowerCase(),
    )
  ) {
    return error("name-conflict", `Another photo already uses the image "${nextFile}"`);
  }

  const newPhotos = photos.map((photo) =>
    photo === original
      ? { ...photo, file: newName, ...(original.thumbnail ? { thumbnail: nextFile } : {}) }
      : photo,
  );
  const relative = `photography/${directory}/${nextFile}`;
  const images = nextFile === oldFile ? {} : { [relative]: await readFile(oldPath) };
  const saved = await savePortfolio(
    folder,
    revision,
    { ...view.catalogs, photography: { ...view.catalogs.photography, photos: newPhotos } },
    images,
  );
  if (!saved.ok) return saved;
  const warning = nextFile === oldFile ? undefined : await trashUnused([oldPath], trash);
  return { ok: true, value: { view: saved.value, warning } };
}

/** Remove the catalog entry and move only its unshared published assets to the system Trash. */
export async function deletePhoto(
  folder: string,
  revision: Revision,
  photoName: string,
  trash: TrashFile,
): Promise<Result<PhotoChange>> {
  const view = await loadPortfolio(folder);
  const photos = view.catalogs.photography.photos;
  const target = photos.find((photo) => photo.file === photoName);
  if (!target) return error("invalid", `Photo "${photoName}" is no longer in the catalog`);

  const paths: string[] = [];
  for (const [directory, filename] of [
    ["thumbnails", target.thumbnail],
    ["published", target.file],
  ] as const) {
    if (!filename || referencedElsewhere(photos, target, filename)) continue;
    const found = await assetPath(folder, directory, filename);
    if (found) paths.push(found);
  }
  const saved = await savePortfolio(folder, revision, {
    ...view.catalogs,
    photography: {
      ...view.catalogs.photography,
      photos: photos.filter((photo) => photo !== target),
    },
  });
  if (!saved.ok) return saved;
  return { ok: true, value: { view: saved.value, warning: await trashUnused(paths, trash) } };
}
