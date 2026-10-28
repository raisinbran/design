import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { WorkspaceRegistry } from "./files";

export interface LockOwner {
  version: 1;
  token: string;
  pid: number;
  appId: string;
  createdAt: string;
}
export class WorkspaceBusyError extends Error {
  constructor(public readonly owner: LockOwner | null) {
    super(
      "This portfolio is already being saved. Close the other writer or recover its interrupted save before retrying.",
    );
  }
}
/** Both apps acquire this same private lock only for the duration of a public transaction. */
export class WorkspaceWriter {
  constructor(
    private readonly privateDirectory: string,
    private readonly registry: WorkspaceRegistry,
    private readonly appId: string,
  ) {}
  private filename(workspaceId: string): string {
    this.registry.root(workspaceId);
    return path.join(
      this.privateDirectory,
      "workspaces",
      workspaceId,
      "write.lock",
    );
  }
  async owner(workspaceId: string): Promise<LockOwner | null> {
    try {
      return JSON.parse(
        await readFile(this.filename(workspaceId), "utf8"),
      ) as LockOwner;
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code === "ENOENT" ||
        error instanceof SyntaxError
      )
        return null;
      throw error;
    }
  }
  async recover<T>(
    workspaceId: string,
    reconcile: () => Promise<T>,
  ): Promise<T> {
    const recoveryFile = this.filename(workspaceId) + ".recovery";
    await mkdir(path.dirname(recoveryFile), { recursive: true, mode: 0o700 });
    let recovery;
    try {
      recovery = await open(recoveryFile, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new Error(
          "Another recovery is in progress. An interrupted recovery claim requires private-state review.",
        );
      throw error;
    }
    try {
      await recovery.writeFile(
        JSON.stringify({
          pid: process.pid,
          createdAt: new Date().toISOString(),
        }),
      );
      await recovery.sync();
      const owner = await this.owner(workspaceId);
      if (owner) {
        try {
          process.kill(owner.pid, 0);
          throw new Error(
            "The writer is still running. Close it before recovery.",
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
        if ((await this.owner(workspaceId))?.token !== owner.token)
          throw new Error("Writer ownership changed during recovery");
        await rm(this.filename(workspaceId));
      } else {
        try {
          await readFile(this.filename(workspaceId));
          throw new Error("The lock is unreadable. Manual review is required.");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      // Acquire a fresh exclusive lock during reconciliation, including when a previous transaction changed catalogs.
      const filename = this.filename(workspaceId);
      const claim: LockOwner = {
        version: 1,
        token: randomUUID(),
        pid: process.pid,
        appId: this.appId,
        createdAt: new Date().toISOString(),
      };
      const handle = await open(filename, "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify(claim));
        await handle.sync();
        await handle.close();
        return await reconcile();
      } finally {
        await handle.close().catch(() => {});
        if ((await this.owner(workspaceId))?.token === claim.token)
          await rm(filename);
      }
    } finally {
      await recovery.close();
      await rm(recoveryFile, { force: true });
    }
  }
  async run<T>(
    workspaceId: string,
    expectedRevision: string,
    save: () => Promise<T>,
  ): Promise<T> {
    const filename = this.filename(workspaceId);
    await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
    const owner: LockOwner = {
      version: 1,
      token: randomUUID(),
      pid: process.pid,
      appId: this.appId,
      createdAt: new Date().toISOString(),
    };
    let handle;
    try {
      handle = await open(filename, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new WorkspaceBusyError(await this.owner(workspaceId));
      throw error;
    }
    try {
      await handle.writeFile(JSON.stringify(owner));
      await handle.sync();
      await handle.close();
      if ((await this.registry.read(workspaceId)).revision !== expectedRevision)
        throw new Error(
          "Portfolio changed outside this window. Refresh before saving.",
        );
      return await save();
    } finally {
      await handle.close().catch(() => {});
      // Never release a replacement lock belonging to another process or recovery operation.
      if ((await this.owner(workspaceId))?.token === owner.token)
        await rm(filename);
    }
  }
}
