import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  copyFile,
} from "node:fs/promises";
import { request } from "node:http";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  authenticated,
  CompanionService,
  validateMessage,
} from "../src/main/companion";
import { WorkspaceRegistry } from "../src/main/files";
import {
  WorkspaceWriter,
  WorkspaceBusyError,
} from "../src/main/workspace-lock";
import { PrivateSourceStore } from "../src/main/private-sources";
import type { CompanionTask } from "../src/contracts";

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "portfolio-link-"));
  const root = path.join(directory, "portfolio");
  await mkdir(path.join(root, "data"), { recursive: true });
  for (const catalog of ["media", "engineering", "archive"])
    await copyFile(
      path.join(process.cwd(), `data/${catalog}-catalog.json`),
      path.join(root, `data/${catalog}-catalog.json`),
    );
  return { directory, root, privateDirectory: path.join(directory, "private") };
}
test("authentication and versioned task validation reject malformed messages", () => {
  assert.equal(authenticated(undefined, "secret"), false);
  assert.equal(authenticated("Bearer wrong", "secret"), false);
  assert.equal(authenticated("Bearer secret", "secret"), true);
  const task = {
    version: 1,
    kind: "open",
    id: randomUUID(),
    workspaceId: "a".repeat(64),
    workspacePath: "/a",
    operation: "reframe",
    photoKey: "image.jpg",
  };
  assert.equal(validateMessage(task).kind, "open");
  assert.throws(() => validateMessage({ ...task, version: 2 }), /version/);
  assert.throws(
    () => validateMessage({ ...task, photoKey: "../private" }),
    /identity/,
  );
  assert.throws(
    () => validateMessage({ ...task, workspacePath: "relative" }),
    /workspace/,
  );
});
test("companion delivery is authenticated, optional, and completion requires a matching durable publication", async () => {
  const f = await fixture();
  const studioRegistry = new WorkspaceRegistry();
  const processorRegistry = new WorkspaceRegistry();
  const workspace = await studioRegistry.select(f.root);
  let received: CompanionTask | undefined;
  let refreshed = "";
  const studio = new CompanionService(
    f.privateDirectory,
    "portfolio-studio",
    studioRegistry,
    () => {},
    (id) => {
      refreshed = id;
    },
  );
  const processor = new CompanionService(
    f.privateDirectory,
    "photo-processor",
    processorRegistry,
    (task) => {
      received = task;
    },
    () => {},
  );
  try {
    await studio.start();
    await processor.start();
    await assert.rejects(
      studio.launch(workspace.id, "import"),
      /Link Photo Processor/,
    );
    await studio.configure(process.execPath, true);
    const taskId = await studio.launch(
      workspace.id,
      "reframe",
      workspace.catalogs.photography.photos[0].file,
    );
    assert.equal(received?.id, taskId);
    assert.equal(received?.workspace.id, workspace.id);
    assert.equal(
      JSON.stringify(received).includes(f.root),
      false,
      "renderer task must not contain source/workspace paths",
    );
    await assert.rejects(processor.complete(taskId), /Publish/);
    const catalog = path.join(f.root, "data/media-catalog.json");
    const data = JSON.parse(await readFile(catalog, "utf8"));
    data.photos[0].alt += " updated";
    await writeFile(catalog, JSON.stringify(data));
    await assert.rejects(
      processor.complete(taskId),
      /Publish/,
      "unrelated external change is not a publication receipt",
    );
    const current = await processorRegistry.read(workspace.id);
    assert.throws(
      () =>
        processor.recordPublication(taskId, "different.jpg", current.revision),
      /match/,
    );
    processor.recordPublication(taskId, data.photos[0].file, current.revision);
    await processor.complete(taskId);
    assert.equal(refreshed, workspace.id);
    assert.equal(processor.currentTasks().length, 0);
    await studio.configure(null, false);
    await assert.rejects(studio.launch(workspace.id, "import"), /Link/);
    const endpoint = JSON.parse(
      await readFile(
        path.join(f.privateDirectory, "integration/photo-processor.json"),
        "utf8",
      ),
    );
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const outgoing = request(
        {
          hostname: "127.0.0.1",
          port: endpoint.port,
          path: "/v1/task",
          method: "POST",
          headers: { Authorization: "Bearer wrong" },
        },
        (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode));
        },
      );
      outgoing.on("error", reject);
      outgoing.end("{}");
    });
    assert.equal(status, 403);
  } finally {
    await studio.stop();
    await processor.stop();
    await rm(f.directory, { recursive: true, force: true });
  }
});
test("shared writer excludes a concurrent app and rejects external catalog changes", async () => {
  const f = await fixture();
  const first = new WorkspaceRegistry();
  const second = new WorkspaceRegistry();
  const workspace = await first.select(f.root);
  await second.select(f.root);
  const studio = new WorkspaceWriter(
    f.privateDirectory,
    first,
    "portfolio-studio",
  );
  const processor = new WorkspaceWriter(
    f.privateDirectory,
    second,
    "photo-processor",
  );
  try {
    await studio.run(workspace.id, workspace.revision, async () => {
      await assert.rejects(
        processor.run(workspace.id, workspace.revision, async () => {}),
        WorkspaceBusyError,
      );
    });
    await processor.run(workspace.id, workspace.revision, async () => {});
    const catalog = path.join(f.root, "data/media-catalog.json");
    await writeFile(catalog, (await readFile(catalog, "utf8")) + "\n");
    await assert.rejects(
      studio.run(workspace.id, workspace.revision, async () => {}),
      /changed outside/,
    );
    assert.equal(await studio.owner(workspace.id), null);
    await assert.rejects(
      studio.run("unknown", workspace.revision, async () => {}),
      /Select/,
    );
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});
test("private sources are keyed outside the site and reject invalid workspace identities", async () => {
  const f = await fixture();
  try {
    const store = new PrivateSourceStore(f.privateDirectory);
    await assert.rejects(store.read("../escape", "photo.jpg"), /identity/);
    assert.equal(await store.read("a".repeat(64), "missing.jpg"), null);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});
