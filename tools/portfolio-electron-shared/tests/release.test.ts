import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fixture } from "./workspace-fixture";
import { WorkspaceRegistry } from "../src/main/files";
import { Transactions } from "../src/main/transactions";
import { WorkspaceWriter } from "../src/main/workspace-lock";
import { installerShortcutAction } from "../src/main/windows-install";

test("a killed writer leaves durable recovery state which a fresh process service restores", async () => {
  const f = await fixture();
  try {
    const filename = path.join(f.root, "js/photography-catalog.js");
    const before = await readFile(filename);
    const page = await readFile(path.join(f.root, "engineeringdesign.html"));
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "tools/portfolio-electron-shared/qa/crash-writer.ts",
        f.root,
        f.privateDirectory,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let errors = "";
    child.stderr.on("data", (bytes) => {
      errors += bytes;
    });
    const result = await new Promise<{
      code: number | null;
      signal: string | null;
    }>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    assert.ok(
      result.signal === "SIGKILL" ||
        (process.platform === "win32" && result.code !== 0),
      errors,
    );
    assert.equal(
      await readFile(filename, "utf8"),
      "partially installed process-death fixture",
    );
    assert.deepEqual(
      await readFile(path.join(f.root, "engineeringdesign.html")),
      page,
    );
    const registry = new WorkspaceRegistry();
    const workspace = await registry.select(f.root);
    const transactions = new Transactions(
      f.privateDirectory,
      registry,
      new WorkspaceWriter(f.privateDirectory, registry, "restarted"),
    );
    const pending = (await transactions.list(workspace.id)).find(
      (item) => item.state === "prepared",
    );
    assert.ok(pending);
    await transactions.recover(workspace.id, pending.id);
    assert.deepEqual(await readFile(filename), before);
    assert.equal(
      (await transactions.list(workspace.id)).find(
        (item) => item.id === pending.id,
      )?.state,
      "rolled-back",
    );
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});
test("Windows install/update/remove events select the correct shortcut action", () => {
  assert.equal(
    installerShortcutAction("--squirrel-install"),
    "--createShortcut",
  );
  assert.equal(
    installerShortcutAction("--squirrel-updated"),
    "--createShortcut",
  );
  assert.equal(
    installerShortcutAction("--squirrel-uninstall"),
    "--removeShortcut",
  );
  assert.equal(installerShortcutAction("--squirrel-firstrun"), null);
});
