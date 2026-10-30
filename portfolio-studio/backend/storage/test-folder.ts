import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Tests run on a copy of this repository, so the real checkout stays untouched.
const repositoryDir = path.resolve(import.meta.dirname, "../../..");
const SKIPPED_IN_COPY = new Set([".git", "node_modules", "worktrees", ".vite", "out"]);

export function copyRepository(): string {
  const copy = mkdtempSync(path.join(os.tmpdir(), "portfolio-studio-repo-"));
  cpSync(repositoryDir, copy, {
    recursive: true,
    filter: (source) => !SKIPPED_IN_COPY.has(path.basename(source)),
  });
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
