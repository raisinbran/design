import { createHash } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PortfolioView, Result, Revision } from "../api/api";
import { Catalogs, listProblems } from "../catalogs/schema";
import {
  archivePage,
  archiveSettingsScript,
  engineeringPage,
  photographyScript,
} from "../site/generate";
import { sanitizeBody } from "../site/sanitize";

const CATALOG_FILES = {
  photography: "data/media-catalog.json",
  engineering: "data/engineering-catalog.json",
  archive: "data/archive-catalog.json",
} as const;
const SITE_FILES = {
  photographyScript: "js/photography-catalog.js",
  engineeringPage: "engineeringdesign.html",
  archivePage: "creativedesign.html",
  archiveSettings: "js/archive-photo-settings.js",
} as const;
const FILES = [...Object.values(CATALOG_FILES), ...Object.values(SITE_FILES)];
export const TEMPORARY_SUFFIX = ".portfolio-studio-tmp";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const toJson = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

async function readFiles(folder: string): Promise<Record<string, string>> {
  const texts = await Promise.all(FILES.map((file) => readFile(path.join(folder, file), "utf8")));
  return Object.fromEntries(FILES.map((file, index) => [file, texts[index]]));
}

const revisionOf = (texts: Record<string, string>): Revision =>
  Object.fromEntries(FILES.map((file) => [file, hash(texts[file])]));

function parseCatalog(file: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${file}: ${(error as Error).message}`);
  }
}

/** Throws when a catalog or generated file is missing, or a catalog is not valid JSON or fails its schema. */
export async function loadPortfolio(folder: string): Promise<PortfolioView> {
  const texts = await readFiles(folder);
  const input = Object.fromEntries(
    Object.entries(CATALOG_FILES).map(([name, file]) => [name, parseCatalog(file, texts[file])]),
  );
  const parsed = Catalogs.safeParse(input);
  if (!parsed.success)
    throw new Error(
      `The catalogs have problems: ${listProblems(parsed.error, input, CATALOG_FILES).join("; ")}`,
    );
  return { folder, revision: revisionOf(texts), catalogs: parsed.data };
}

let saving = false;

/**
 * Writes the catalogs and the four generated site files, skipping files whose bytes would not change.
 * Writes nothing when the catalogs are `invalid` or any file differs from the loaded `revision`.
 */
export async function savePortfolio(
  folder: string,
  revision: Revision,
  catalogs: Catalogs,
): Promise<Result<PortfolioView>> {
  // One save at a time: a second save would compare against files the first is replacing.
  if (saving)
    return { ok: false, error: { code: "internal", message: "A save is already running" } };
  saving = true;
  try {
    const parsed = Catalogs.safeParse(catalogs);
    if (!parsed.success) {
      const problems = listProblems(parsed.error, catalogs, CATALOG_FILES);
      return {
        ok: false,
        error: { code: "invalid", message: "The catalogs have problems", problems },
      };
    }
    const current = await readFiles(folder);
    const changed = FILES.filter((file) => hash(current[file]) !== revision[file]);
    if (changed.length) {
      const message = `Files changed outside the app: ${changed.join(", ")}`;
      return { ok: false, error: { code: "changed-outside", message } };
    }
    const { photography, archive } = parsed.data;
    const engineering = sanitizeEditedBodies(
      parsed.data.engineering,
      current[CATALOG_FILES.engineering],
    );
    const next: Record<string, string> = {
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
    };
    await replaceFiles(
      folder,
      FILES.filter((file) => next[file] !== current[file]),
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
// Catalogs are renamed before site files, so after a failed rename, Reload then save regenerates the site from them.
async function replaceFiles(
  folder: string,
  files: string[],
  texts: Record<string, string>,
): Promise<void> {
  const temporaries = files.map((file) => path.join(folder, file + TEMPORARY_SUFFIX));
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
  for (const [index, temporary] of temporaries.entries()) {
    try {
      await rename(temporary, path.join(folder, files[index]));
    } catch (error) {
      await removeAll(temporaries.slice(index));
      const replaced = files.slice(0, index).join(", ") || "none";
      const kept = files.slice(index).join(", ");
      throw new Error(
        `Saving stopped part way (${(error as Error).message}). Replaced: ${replaced}. Not replaced: ${kept}. Reload, then save again.`,
      );
    }
  }
}
