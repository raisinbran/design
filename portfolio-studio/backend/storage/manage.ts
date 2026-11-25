import { randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rename } from "node:fs/promises";
import path from "node:path";
import type { PhotoChange, PortfolioView, Result, Revision } from "../api/api";
import { describeUses, moveItem, photoSrc, removeItem, repointUses } from "../../shared/library";
import { photoNameProblem } from "./names";
import { publicationRoot } from "./publication-paths";
import { loadPortfolio, savePortfolio } from "./portfolio";

type Photo = PortfolioView["catalogs"]["photography"]["photos"][number];
// A renamed file keeps its pages, and every page that uses it follows it to the new path.
const renamed = (catalogs: PortfolioView["catalogs"], from: string, to: string) =>
  moveItem(repointUses(catalogs, from, to), from, to);

type TrashFile = (file: string) => Promise<void>;

const error = (code: "invalid" | "name-conflict", message: string): Result<PhotoChange> => ({
  ok: false,
  error: { code, message },
});

// The validated publication directory and regular file must both stay within the repository.
async function assetPath(root: string, filename: string): Promise<string | null> {
  if (path.basename(filename) !== filename || filename === "." || filename === "..") return null;
  const target = path.join(root, filename);
  const info = await lstat(target).catch(() => null);
  if (!info?.isFile() || info.isSymbolicLink()) return null;
  const resolved = await realpath(target);
  return path.dirname(resolved) === root ? resolved : null;
}

// A two-step rename updates the on-disk spelling on case-insensitive Windows/macOS volumes.
async function correctFilenameCase(
  root: string,
  existing: string,
  nextName: string,
): Promise<void> {
  if (path.basename(existing) === nextName) return;
  const temporary = path.join(root, `.portfolio-studio-case-${randomUUID()}`);
  await rename(existing, temporary);
  try {
    await rename(temporary, path.join(root, nextName));
  } catch (error) {
    await rename(temporary, existing).catch(() => null);
    throw error;
  }
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

  // A photo whose image sits at a site path keeps its file; only the catalog name changes.
  if (original.thumbnail?.includes("/")) {
    const newPhotos = photos.map((photo) =>
      photo === original ? { ...photo, file: newName } : photo,
    );
    const saved = await savePortfolio(folder, revision, {
      ...view.catalogs,
      photography: { ...view.catalogs.photography, photos: newPhotos },
    });
    return saved.ok ? { ok: true, value: { view: saved.value } } : saved;
  }

  const directory = original.thumbnail ? "thumbnails" : "published";
  const root = await publicationRoot(folder, directory);
  if (!root) return error("invalid", `Unsafe or missing site image directory: ${directory}`);
  const oldFile = original.thumbnail ?? oldName;
  const oldExtension = path.extname(oldFile);
  if (
    path.extname(original.file).toLowerCase() === oldExtension.toLowerCase() &&
    path.extname(newName).toLowerCase() !== oldExtension.toLowerCase()
  ) {
    return error("invalid", "Renaming cannot change the encoded file type. Reimport to convert.");
  }
  const nextFile = original.thumbnail ? path.parse(newName).name + oldExtension : newName;
  const collision = await assetPath(root, nextFile);
  const oldPath = await assetPath(root, oldFile);
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
    renamed(
      { ...view.catalogs, photography: { ...view.catalogs.photography, photos: newPhotos } },
      photoSrc(original),
      photoSrc(newPhotos.find((photo) => photo.file === newName)!),
    ),
    images,
  );
  if (!saved.ok) return saved;
  // On case-insensitive volumes both names may resolve to the replacement after saving.
  const oldAfterSave = await assetPath(root, oldFile);
  const newAfterSave = await assetPath(root, nextFile);
  let caseWarning: string | undefined;
  if (nextFile !== oldFile && oldAfterSave && newAfterSave && oldAfterSave === newAfterSave) {
    try {
      await correctFilenameCase(root, newAfterSave, nextFile);
    } catch {
      caseWarning =
        "Changes saved, but the image filename's capitalization could not be updated. " +
        `Verify ${nextFile} in GitHub Desktop before publishing.`;
    }
  }
  const warning =
    nextFile !== oldFile &&
    !referencedElsewhere(photos, original, oldFile) &&
    oldAfterSave &&
    newAfterSave &&
    oldAfterSave !== newAfterSave
      ? await trashUnused([oldAfterSave], trash)
      : caseWarning;
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
  const sharedWith = describeUses(view.catalogs, photoSrc(target), "photography");
  if (sharedWith)
    return error(
      "invalid",
      `"${photoName}" is also used by ${sharedWith}, so it cannot be deleted`,
    );

  const paths: string[] = [];
  // An image at a site path is not this photo's to trash; deleting only drops the entry.
  const owned = target.thumbnail?.includes("/")
    ? []
    : ([
        ["thumbnails", target.thumbnail],
        ["published", target.file],
      ] as const);
  for (const [directory, filename] of owned) {
    if (!filename) continue;
    const root = await publicationRoot(folder, directory);
    if (!root) return error("invalid", `Unsafe or missing site image directory: ${directory}`);
    if (referencedElsewhere(photos, target, filename)) continue;
    const found = await assetPath(root, filename);
    if (found) paths.push(found);
  }
  const saved = await savePortfolio(
    folder,
    revision,
    removeItem(
      {
        ...view.catalogs,
        photography: {
          ...view.catalogs.photography,
          photos: photos.filter((photo) => photo !== target),
        },
      },
      photoSrc(target),
    ),
  );
  if (!saved.ok) return saved;
  return { ok: true, value: { view: saved.value, warning: await trashUnused(paths, trash) } };
}
