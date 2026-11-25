import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

// Tests run on a copy of this repository, so the real checkout stays untouched.
const repositoryDir = path.resolve(import.meta.dirname, "../../..");
const SKIPPED_IN_COPY = new Set([".git", "node_modules", "worktrees", ".vite", "out"]);

// For the hooks that copy and delete the repository. On GitHub's Windows runner the first copy
// took up to 16 s while the render tests ran, over Vitest's 10 s hook default.
export const COPY_TIMEOUT_MS = 30_000;

const PHOTO_FOLDER = "images/Photography";

// The website keeps its photos in images/Photography. Older sites kept them in photography/
// thumbnails under a bare name, and the app still supports that, so most tests run on a copy
// put back into that layout. Pass `{ legacy: false }` for the website as it is.
function useLegacyLayout(copy: string) {
  const thumbnails = path.join(copy, "photography", "thumbnails");
  mkdirSync(thumbnails, { recursive: true });
  for (const name of readdirSync(path.join(copy, PHOTO_FOLDER))) {
    renameSync(path.join(copy, PHOTO_FOLDER, name), path.join(thumbnails, name));
  }
  rmSync(path.join(copy, PHOTO_FOLDER), { recursive: true });
  for (const file of ["data/media-catalog.json", "js/photography-catalog.js"]) {
    const text = readFileSync(path.join(copy, file), "utf8");
    writeFileSync(
      path.join(copy, file),
      text.replaceAll(`"thumbnail": "${PHOTO_FOLDER}/`, '"thumbnail": "'),
    );
  }
  const home = path.join(copy, "index.html");
  writeFileSync(
    home,
    readFileSync(home, "utf8").replaceAll(PHOTO_FOLDER + "/", "photography/thumbnails/"),
  );
}

export function copyRepository({ legacy = true } = {}): string {
  const copy = mkdtempSync(path.join(os.tmpdir(), "portfolio-studio-repo-"));
  cpSync(repositoryDir, copy, {
    recursive: true,
    filter: (source) => !SKIPPED_IN_COPY.has(path.basename(source)),
  });
  if (legacy) useLegacyLayout(copy);
  return copy;
}

/** Maps each file's path, relative to `folder` and with forward slashes, to its SHA-256. */
export function hashFiles(folder: string): Record<string, string> {
  const entries = readdirSync(folder, { recursive: true, withFileTypes: true }).filter((entry) =>
    entry.isFile(),
  );
  return Object.fromEntries(
    entries.map((entry) => {
      const file = path.join(entry.parentPath, entry.name);
      const relative = path.relative(folder, file).split(path.sep).join("/");
      return [relative, createHash("sha256").update(readFileSync(file)).digest("hex")];
    }),
  );
}
