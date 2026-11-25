import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PortfolioView, Result, Revision } from "../api/api";
import { Catalogs, listProblems } from "../catalogs/schema";
import { deriveLibrary, repairLibrary, type Library } from "../../shared/library";
import {
  archivePage,
  archiveSettingsScript,
  engineeringPage,
  photographyScript,
} from "../site/generate";
import { sanitizeBody } from "../site/sanitize";
import { publicationRoot } from "./publication-paths";

const CATALOG_FILES = {
  photography: "data/media-catalog.json",
  engineering: "data/engineering-catalog.json",
  archive: "data/archive-catalog.json",
} as const;
const FILE_NAMES = { ...CATALOG_FILES, library: "data/media-library.json" };
const SITE_FILES = {
  photographyScript: "js/photography-catalog.js",
  engineeringPage: "engineeringdesign.html",
  archivePage: "creativedesign.html",
  archiveSettings: "js/archive-photo-settings.js",
} as const;
const FILES = [...Object.values(CATALOG_FILES), ...Object.values(SITE_FILES)];
// The library file is optional: without it the library is what the catalogs imply, and a save
// creates the file only when the library says more than that.
const LIBRARY_FILE = "data/media-library.json";
const ABSENT = "absent";
export const TEMPORARY_SUFFIX = ".portfolio-studio-tmp";
const BACKUP_SUFFIX = ".portfolio-studio-bak";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const toJson = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

// The library file's text is "" while the file is absent.
async function readFiles(folder: string): Promise<Record<string, string>> {
  const texts = await Promise.all(FILES.map((file) => readFile(path.join(folder, file), "utf8")));
  const library = await readFile(path.join(folder, LIBRARY_FILE), "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  });
  return {
    ...Object.fromEntries(FILES.map((file, index) => [file, texts[index]])),
    [LIBRARY_FILE]: library,
  };
}

const revisionOf = (texts: Record<string, string>): Revision =>
  Object.fromEntries(
    [...FILES, LIBRARY_FILE].map((file) => [
      file,
      file === LIBRARY_FILE && texts[file] === "" ? ABSENT : hash(texts[file]),
    ]),
  );

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

function parseCatalog(file: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${file}: ${describeError(error)}`);
  }
}

/** Throws when a catalog or generated file is missing, or a catalog is not valid JSON or fails its schema. */
export async function loadPortfolio(folder: string): Promise<PortfolioView> {
  const missing = FILES.filter((file) => !existsSync(path.join(folder, file)));
  if (missing.length)
    throw new Error(
      `This is not the website folder, because it has no ${missing.join(", ")}. Choose the folder that holds data/ and index.html.`,
    );
  const texts = await readFiles(folder);
  const input: Record<string, unknown> = Object.fromEntries(
    Object.entries(CATALOG_FILES).map(([name, file]) => [name, parseCatalog(file, texts[file])]),
  );
  // Without a library file the library is empty here and filled in below.
  input.library = texts[LIBRARY_FILE]
    ? parseCatalog(LIBRARY_FILE, texts[LIBRARY_FILE])
    : { schemaVersion: 1, items: [] };
  const parsed = Catalogs.safeParse(input);
  // The old apps' catalogs carry fields this app dropped, such as sourceHtml in the archive catalog.
  const unknownFields = parsed.error?.issues.filter((issue) => issue.code === "unrecognized_keys");
  if (unknownFields?.length) {
    const names = unknownFields.map((issue) => issue.path[0] as keyof typeof FILE_NAMES);
    throw new Error(
      `These catalogs are in the old apps' format: ${[...new Set(names)].map((name) => FILE_NAMES[name]).join(", ")}. Pull the latest version in GitHub Desktop, then press Reload.`,
    );
  }
  if (!parsed.success)
    throw new Error(
      `The catalogs have problems: ${listProblems(parsed.error, input, FILE_NAMES).join("; ")}`,
    );
  const { library, ...content } = parsed.data;
  return {
    folder,
    revision: revisionOf(texts),
    catalogs: { ...content, library: repairLibrary(library, content) },
  };
}

// Item order is not meaning, so a library that differs from the derived one only in order is the same.
const sameItems = (a: Library, b: Library) => {
  const sorted = (library: Library) =>
    toJson([...library.items].sort((x, y) => x.src.localeCompare(y.src)));
  return sorted(a) === sorted(b);
};

let saving = false;

/**
 * Writes the catalogs and the four generated site files, skipping files whose bytes would not change.
 * Writes nothing when the catalogs are `invalid` or any file differs from the loaded `revision`.
 * `images` maps paths in the folder to new image files, which are written first.
 */
export async function savePortfolio(
  folder: string,
  revision: Revision,
  catalogs: Catalogs,
  images: Record<string, Uint8Array> = {},
): Promise<Result<PortfolioView>> {
  // One save runs at a time, because a second save would compare against files the first is
  // replacing.
  if (saving)
    return { ok: false, error: { code: "internal", message: "A save is already running" } };
  saving = true;
  try {
    const parsed = Catalogs.safeParse(catalogs);
    if (!parsed.success) {
      const problems = listProblems(parsed.error, catalogs, FILE_NAMES);
      return {
        ok: false,
        error: { code: "invalid", message: "The catalogs have problems", problems },
      };
    }
    // Reject untrusted image directories before any site derivative is written.
    for (const relative of Object.keys(images)) {
      const [section, directory, filename, ...extra] = relative.split("/");
      if (
        section !== "photography" ||
        (directory !== "thumbnails" && directory !== "published") ||
        !filename ||
        extra.length > 0 ||
        filename === "." ||
        filename === ".." ||
        filename.includes("\\") ||
        path.basename(filename) !== filename
      ) {
        return {
          ok: false,
          error: { code: "invalid", message: `Invalid publication path: ${relative}` },
        };
      }
      if (!(await publicationRoot(folder, directory))) {
        return {
          ok: false,
          error: { code: "invalid", message: `Unsafe publication directory: ${directory}` },
        };
      }
    }
    const current = await readFiles(folder);
    const changed = [...FILES, LIBRARY_FILE].filter(
      (file) => revisionOf(current)[file] !== revision[file],
    );
    if (changed.length) {
      const message = `Files changed outside the app: ${changed.join(", ")}`;
      return { ok: false, error: { code: "changed-outside", message } };
    }
    const { library: unrepaired, ...content } = parsed.data;
    const { photography, archive } = content;
    const library = repairLibrary(unrepaired, content);
    const libraryText = toJson(library);
    // An absent file is created only when the library says more than the catalogs do.
    const writeLibrary =
      current[LIBRARY_FILE] === ""
        ? sameItems(library, deriveLibrary(content)) === false
        : libraryText !== current[LIBRARY_FILE];
    const engineering = sanitizeEditedBodies(
      content.engineering,
      current[CATALOG_FILES.engineering],
    );
    const next: Record<string, string | Uint8Array> = {
      ...images,
      [CATALOG_FILES.photography]: toJson(photography),
      [CATALOG_FILES.engineering]: toJson(engineering),
      [CATALOG_FILES.archive]: toJson(archive),
      [SITE_FILES.photographyScript]: photographyScript(photography),
      [SITE_FILES.engineeringPage]: engineeringPage(
        current[SITE_FILES.engineeringPage],
        engineering,
      ),
      [SITE_FILES.archivePage]: archivePage(current[SITE_FILES.archivePage], archive),
      [SITE_FILES.archiveSettings]: archiveSettingsScript(archive),
      [LIBRARY_FILE]: libraryText,
    };
    await replaceFiles(
      folder,
      [
        ...Object.keys(images),
        ...FILES.filter((file) => next[file] !== current[file]),
        ...(writeLibrary ? [LIBRARY_FILE] : []),
      ],
      next,
    );
    return { ok: true, value: await loadPortfolio(folder) };
  } finally {
    saving = false;
  }
}

// Only a body that differs from the saved one is sanitized, because sanitizing rewrites markup the
// owner did not touch, and a save without edits must change no file.
function sanitizeEditedBodies(engineering: Catalogs["engineering"], savedText: string) {
  const saved = (JSON.parse(savedText) as Catalogs["engineering"]).projects;
  const savedBodies = new Map(saved.map((project) => [project.id, project.bodyHtml]));
  return {
    ...engineering,
    projects: engineering.projects.map((project) =>
      savedBodies.get(project.id) === project.bodyHtml
        ? project
        : { ...project, bodyHtml: sanitizeBody(project.bodyHtml) },
    ),
  };
}

// Writes every temporary file before renaming any, so a failed write leaves all destinations untouched.
// Images are renamed first, so a catalog entry never names a missing image. If a rename fails, the files
// already replaced are put back from copies made just before, so a failed save changes nothing.
export async function replaceFiles(
  folder: string,
  files: string[],
  texts: Record<string, string | Uint8Array>,
  move: typeof rename = rename,
): Promise<void> {
  const temporaries = files.map((file) => path.join(folder, file + TEMPORARY_SUFFIX));
  const backups = files.map((file) => path.join(folder, file + BACKUP_SUFFIX));
  const removeAll = (paths: string[]) =>
    Promise.allSettled(paths.map((temporary) => rm(temporary, { force: true })));
  const written: string[] = [];
  try {
    for (const [index, temporary] of temporaries.entries()) {
      await rm(temporary, { force: true });
      await writeFile(temporary, texts[files[index]], { flag: "wx" });
      written.push(temporary);
    }
  } catch (error) {
    await removeAll(written);
    throw error;
  }
  // A backup exists only for a file that already existed; a new file is deleted on rollback.
  const existed = new Set<number>();
  const replaced: number[] = [];
  try {
    for (const [index, file] of files.entries()) {
      await rm(backups[index], { force: true });
      try {
        await copyFile(path.join(folder, file), backups[index]);
        existed.add(index);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    for (const [index, temporary] of temporaries.entries()) {
      await move(temporary, path.join(folder, files[index]));
      replaced.push(index);
    }
  } catch (error) {
    const failed: number[] = [];
    for (const index of replaced.reverse()) {
      const destination = path.join(folder, files[index]);
      try {
        if (existed.has(index)) await move(backups[index], destination);
        else await rm(destination, { force: true });
      } catch {
        failed.push(index);
      }
    }
    await removeAll([...temporaries, ...backups.filter((_, index) => !failed.includes(index))]);
    const reason = describeError(error);
    // A created file has no backup, so only the others can be recovered from a kept copy.
    const kept = failed.filter((index) => existed.has(index));
    const names = failed.map((index) => files[index]).join(", ");
    throw new Error(
      failed.length
        ? `Saving failed, because ${reason}, and these files could not be put back: ${names}.` +
            (kept.length
              ? ` Originals are kept beside them with the ending ${BACKUP_SUFFIX}.`
              : " They were new files, so delete them.")
        : `Saving failed, because ${reason}. No file was changed.`,
    );
  }
  await removeAll(backups);
}
