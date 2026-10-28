import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { atomicWrite, digest, workspaceFile, WorkspaceRegistry } from "./files";
import { WorkspaceWriter } from "./workspace-lock";

export interface FileChange {
  relative: string;
  bytes: Uint8Array | null;
  expected: string | null;
  private?: boolean;
}
interface JournalEntry {
  relative: string;
  private?: boolean;
  before: string | null;
  after: string | null;
  index: number;
}
interface Journal {
  version: 1;
  id: string;
  workspaceId: string;
  title: string;
  state: "prepared" | "committed" | "rolled-back";
  createdAt: string;
  entries: JournalEntry[];
}
export interface RecoveryItem {
  id: string;
  title: string;
  state: string;
  createdAt: string;
}
export async function fileDigest(filename: string): Promise<string | null> {
  try {
    return digest(await readFile(filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
/** Private journals contain complete before/after bytes. A crash never requires guessing which files changed. */
export class Transactions {
  constructor(
    private directory: string,
    private registry: WorkspaceRegistry,
    private writer: WorkspaceWriter,
  ) {}
  private folder(workspaceId: string) {
    const root = this.registry.root(workspaceId);
    const relative = path.relative(root, this.directory);
    if (
      !relative ||
      (!relative.startsWith(".." + path.sep) &&
        relative !== ".." &&
        !path.isAbsolute(relative))
    )
      throw new Error("Private backups must be outside the website folder");
    return path.join(this.directory, "workspaces", workspaceId, "transactions");
  }
  private async target(
    workspaceId: string,
    entry: Pick<JournalEntry, "relative" | "private">,
  ) {
    if (entry.private) {
      if (
        !new RegExp(
          `^workspaces/${workspaceId}/sources/[a-f0-9]{64}\\.json$`,
        ).test(entry.relative)
      )
        throw new Error("Invalid private transaction target");
      return workspaceFile(this.directory, entry.relative);
    }
    return workspaceFile(this.registry.root(workspaceId), entry.relative);
  }
  async list(workspaceId: string): Promise<RecoveryItem[]> {
    const folder = this.folder(workspaceId);
    let names: string[];
    try {
      names = await readdir(folder);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const journals = await Promise.all(
      names
        .filter((name) => /^[a-f0-9-]{36}$/.test(name))
        .map(async (name) => {
          try {
            return JSON.parse(
              await readFile(path.join(folder, name, "journal.json"), "utf8"),
            ) as Journal;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
            throw error;
          }
        }),
    );
    return journals
      .filter((journal): journal is Journal => journal !== null)
      .map(({ id, title, state, createdAt }) => ({
        id,
        title,
        state,
        createdAt,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async pending(workspaceId: string): Promise<boolean> {
    return (await this.list(workspaceId)).some(
      (item) => item.state === "prepared",
    );
  }
  async commit(
    workspaceId: string,
    revision: string,
    title: string,
    changes: FileChange[],
    afterInstall?: (index: number) => void,
  ): Promise<void> {
    if (await this.pending(workspaceId))
      throw new Error(
        "Recover the interrupted save before writing this portfolio.",
      );
    await this.writer.run(workspaceId, revision, async () => {
      const id = randomUUID();
      const folder = path.join(this.folder(workspaceId), id);
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const entries: JournalEntry[] = [];
      const targets = new Set<string>();
      // Verify all expected files before staging anything, then persist every backup before installation.
      for (const [index, change] of changes.entries()) {
        const filename = await this.target(workspaceId, change);
        if (targets.has(filename))
          throw new Error("Duplicate transaction destination");
        targets.add(filename);
        const current = await fileDigest(filename);
        if (current !== change.expected)
          throw new Error(
            `File changed outside this app: ${change.relative}. Refresh and review before saving.`,
          );
        const after = change.bytes === null ? null : digest(change.bytes);
        if (current === after) continue;
        if (current !== null)
          await atomicWrite(
            path.join(folder, `${index}.before`),
            await readFile(filename),
          );
        if (change.bytes !== null)
          await atomicWrite(path.join(folder, `${index}.after`), change.bytes);
        entries.push({
          relative: change.relative,
          private: change.private,
          before: current,
          after,
          index,
        });
      }
      if (!entries.length) {
        await rm(folder, { recursive: true });
        return;
      }
      const journal: Journal = {
        version: 1,
        id,
        workspaceId,
        title,
        state: "prepared",
        createdAt: new Date().toISOString(),
        entries,
      };
      const journalPath = path.join(folder, "journal.json");
      await atomicWrite(journalPath, JSON.stringify(journal));
      try {
        for (const entry of entries) {
          const filename = await this.target(workspaceId, entry);
          if ((await fileDigest(filename)) !== entry.before)
            throw new Error(`File changed during save: ${entry.relative}`);
          await this.install(
            filename,
            entry.after === null
              ? null
              : await readFile(path.join(folder, `${entry.index}.after`)),
            id,
          );
          afterInstall?.(entry.index);
        }
        journal.state = "committed";
        await atomicWrite(journalPath, JSON.stringify(journal));
      } catch (error) {
        try {
          await this.rollback(journal, folder);
        } catch (recoveryError) {
          throw new Error(
            `Save interrupted. Recovery is required: ${String(recoveryError)}. Original error: ${String(error)}`,
          );
        }
        throw error;
      }
    });
  }
  private async install(
    filename: string,
    bytes: Uint8Array | null,
    id: string,
  ) {
    if (bytes === null) {
      await rm(filename, { force: true });
      return;
    }
    await mkdir(path.dirname(filename), { recursive: true });
    const staged = `${filename}.portfolio-${id}.staged`;
    try {
      await atomicWrite(staged, bytes);
      await rename(staged, filename);
    } finally {
      await rm(staged, { force: true });
    }
  }
  private async rollback(journal: Journal, folder: string) {
    // Preflight every file before restoring any: unrelated external edits are never clobbered.
    for (const entry of journal.entries) {
      const current = await fileDigest(
        await this.target(journal.workspaceId, entry),
      );
      if (current !== entry.before && current !== entry.after)
        throw new Error(
          `External edits require manual reconciliation: ${entry.relative}`,
        );
    }
    for (const entry of [...journal.entries].reverse()) {
      const filename = await this.target(journal.workspaceId, entry);
      const current = await fileDigest(filename);
      if (current !== entry.before && current !== entry.after)
        throw new Error(`File changed during recovery: ${entry.relative}`);
      if (current !== entry.before) {
        const bytes =
          entry.before === null
            ? null
            : await readFile(path.join(folder, `${entry.index}.before`));
        if (bytes !== null && digest(bytes) !== entry.before)
          throw new Error("Recovery backup failed integrity verification");
        await this.install(filename, bytes, journal.id);
      }
      await rm(`${filename}.portfolio-${journal.id}.staged`, { force: true });
    }
    journal.state = "rolled-back";
    await atomicWrite(
      path.join(folder, "journal.json"),
      JSON.stringify(journal),
    );
  }
  async recover(workspaceId: string, id: string): Promise<void> {
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new Error("Invalid recovery identity");
    const folder = path.join(this.folder(workspaceId), id);
    const journal = JSON.parse(
      await readFile(path.join(folder, "journal.json"), "utf8"),
    ) as Journal;
    if (
      journal.version !== 1 ||
      journal.workspaceId !== workspaceId ||
      journal.id !== id ||
      !["prepared", "committed"].includes(journal.state)
    )
      throw new Error("Invalid recovery journal");
    await this.writer.recover(workspaceId, async () =>
      this.rollback(journal, folder),
    );
  }
}
