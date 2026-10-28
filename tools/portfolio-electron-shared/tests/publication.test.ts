import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  copyFile,
  readdir,
} from "node:fs/promises";
import { writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { WorkspaceRegistry, digest } from "../src/main/files";
import { WorkspaceWriter } from "../src/main/workspace-lock";
import { Transactions, fileDigest } from "../src/main/transactions";
import {
  PublicationService,
  PublicationConflict,
} from "../src/main/publication";
import { ProcessingService } from "../src/main/processing";
import { renderImage } from "../src/processing/render-image";
import { defaultRecipe } from "../src/renderer/editor-state";
import {
  archiveOutput,
  engineeringPage,
  photographyScript,
} from "../src/main/site-content";
import { LegacyMigration } from "../src/main/migration";
import { SitePreview } from "../src/main/site-preview";
import { reconcile } from "../src/main/reconcile";
const require = createRequire(import.meta.url);
const sharp: typeof import("sharp") = require("../../portfolio-studio-electron/node_modules/sharp");
import { fixture } from "./workspace-fixture";
test("single-image publication reuses exact preview bytes, saves private recipe, preserves originals, handles conflicts and format replacement", async () => {
  const f = await fixture();
  try {
    const originalHash = await fileDigest(f.original);
    const beforeFiles = await readdir(
      path.join(f.root, "photography/thumbnails"),
    );
    const recipe = defaultRecipe();
    const preview = await f.processing.render("source", recipe, () => {});
    let result = await f.publication.publish({
      workspaceId: f.workspace.id,
      revision: f.workspace.revision,
      sourceId: "source",
      token: preview.token,
      recipe,
      alt: "New protected photograph",
      tags: ["New tag"],
    });
    let photo = result.workspace.catalogs.photography.photos.at(-1)!;
    assert.equal(photo.publishedImage, true);
    assert.equal(photo.thumbnailFramed, true);
    assert.deepEqual(photo.tags, ["New tag"]);
    const output = path.join(
      f.root,
      "photography/thumbnails",
      photo.thumbnail!,
    );
    assert.deepEqual(
      await readFile(output),
      Buffer.from(preview.dataUrl.split(",")[1], "base64"),
    );
    assert.equal(
      (await readdir(path.join(f.root, "photography/thumbnails"))).length,
      beforeFiles.length + 1,
    );
    await assert.rejects(
      readFile(path.join(f.root, "photography/published", photo.file)),
      /ENOENT/,
    );
    assert.equal(await fileDigest(f.original), originalHash);
    const publicText = await readFile(
      path.join(f.root, "data/media-catalog.json"),
      "utf8",
    );
    assert.equal(publicText.includes(f.directory), false);
    const source = JSON.parse(
      await readFile(
        path.join(
          f.privateDirectory,
          "workspaces",
          f.workspace.id,
          "sources",
          digest(photo.file) + ".json",
        ),
        "utf8",
      ),
    );
    assert.equal(source.originalPath, f.original);
    assert.deepEqual(source.recipe, recipe);
    const second = await f.processing.render("source", recipe, () => {});
    const request = {
      workspaceId: f.workspace.id,
      revision: result.workspace.revision,
      sourceId: "source",
      token: second.token,
      recipe,
      alt: "Duplicate",
    };
    await assert.rejects(f.publication.publish(request), PublicationConflict);
    assert.equal(
      (await f.publication.publish({ ...request, conflict: "skip" })).skipped,
      true,
    );
    const renamed = await f.publication.publish({
      ...request,
      conflict: "rename",
    });
    assert.equal(renamed.photoKey, "Original-2.png");
    const jpeg = { ...recipe, format: "jpeg" as const };
    const third = await f.processing.render("source", jpeg, () => {});
    result = await f.publication.publish({
      workspaceId: f.workspace.id,
      revision: renamed.workspace.revision,
      sourceId: "source",
      token: third.token,
      recipe: jpeg,
      photoKey: photo.file,
    });
    await assert.rejects(readFile(output), /ENOENT/);
    photo = result.workspace.catalogs.photography.photos.find(
      (item) => item.file === photo.file,
    )!;
    assert.ok(photo.thumbnail!.endsWith(".jpg"));
    assert.equal(await fileDigest(f.original), originalHash);
    const recovery = await f.transactions.list(f.workspace.id);
    assert.ok(recovery.some((item) => item.state === "committed"));
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});
test("Studio materializes Engineering and Archive edits while preserving outside page bytes and later save templates", async () => {
  const f = await fixture();
  try {
    const originalPage = await readFile(
      path.join(f.root, "engineeringdesign.html"),
      "utf8",
    );
    const archivePage = await readFile(
      path.join(f.root, "creativedesign.html"),
      "utf8",
    );
    const catalogs = structuredClone(f.workspace.catalogs);
    catalogs.engineering.projects[0].title = "Changed Engineering Title";
    catalogs.engineering.projects[0].bodyHtml =
      "<p><strong>Updated</strong> rich text</p>";
    catalogs.engineering.projects[0].media[0].caption = "Changed video";
    catalogs.archive.collections[0].title = "Changed Archive Title";
    catalogs.archive.collections[0].media[0].prominence = "featured";
    const saved = await f.publication.save(
      f.workspace.id,
      f.workspace.revision,
      catalogs,
    );
    const page = await readFile(
      path.join(f.root, "engineeringdesign.html"),
      "utf8",
    );
    assert.ok(page.includes("Changed Engineering Title"));
    assert.ok(page.includes("<strong>Updated</strong>"));
    assert.ok(page.includes("Changed video"));
    assert.equal(
      page.slice(
        0,
        page.indexOf("<!-- portfolio-studio:engineering:start -->"),
      ),
      originalPage.slice(0, originalPage.search(/<details\b/i)),
    );
    const archive = await readFile(
      path.join(f.root, "creativedesign.html"),
      "utf8",
    );
    assert.ok(archive.includes("Changed Archive Title"));
    assert.equal(
      archive.slice(0, archive.search(/<details\b/i)),
      archivePage.slice(0, archivePage.search(/<details\b/i)),
    );
    assert.equal(saved.catalogs.archive.sourceHtml, archive);
    assert.equal(saved.catalogs.archive.sourceSha256, digest(archive));
    const next = structuredClone(saved.catalogs);
    next.archive.collections[0].media[0].caption = "Second archive save";
    await f.publication.save(f.workspace.id, saved.revision, next);
    assert.ok(
      (
        await readFile(path.join(f.root, "creativedesign.html"), "utf8")
      ).includes("Second archive save"),
    );
    const bad = structuredClone(
      (await f.registry.read(f.workspace.id)).catalogs,
    );
    bad.engineering.projects[0].bodyHtml = "<img src=x onerror=alert(1)>";
    await assert.rejects(
      f.publication.save(
        f.workspace.id,
        (await f.registry.read(f.workspace.id)).revision,
        bad,
      ),
      /unsafe/,
    );
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});
test("transaction interruption rolls back, restart recovery rejects outside edits and restores private backups under stale-lock proof", async () => {
  const f = await fixture();
  try {
    const relative = "js/photography-catalog.js";
    const filename = path.join(f.root, relative);
    const original = await readFile(filename);
    const expected = digest(original);
    await assert.rejects(
      f.transactions.commit(
        f.workspace.id,
        f.workspace.revision,
        "Injected interruption",
        [{ relative, bytes: Buffer.from("after"), expected }],
        () => {
          throw new Error("power interruption");
        },
      ),
      /power interruption/,
    );
    assert.deepEqual(await readFile(filename), original);
    await assert.rejects(
      f.transactions.commit(
        f.workspace.id,
        f.workspace.revision,
        "Interrupted with outside edit",
        [{ relative, bytes: Buffer.from("after"), expected }],
        () => {
          writeFileSync(filename, "outside edit");
          throw new Error("interrupted");
        },
      ),
      /Recovery is required/,
    );
    const pending = (await f.transactions.list(f.workspace.id)).find(
      (item) => item.state === "prepared",
    )!;
    await assert.rejects(
      f.transactions.recover(f.workspace.id, pending.id),
      /External edits/,
    );
    assert.equal(await readFile(filename, "utf8"), "outside edit");
    await writeFile(filename, "after");
    const lock = path.join(
      f.privateDirectory,
      "workspaces",
      f.workspace.id,
      "write.lock",
    );
    await writeFile(
      lock,
      JSON.stringify({
        version: 1,
        token: "crashed-owner",
        pid: 2147483647,
        appId: "test",
        createdAt: new Date().toISOString(),
      }),
    );
    const restarted = new Transactions(
      f.privateDirectory,
      f.registry,
      new WorkspaceWriter(f.privateDirectory, f.registry, "restarted"),
    );
    await restarted.recover(f.workspace.id, pending.id);
    assert.deepEqual(await readFile(filename), original);
    await writeFile(
      lock,
      JSON.stringify({
        version: 1,
        token: "live-owner",
        pid: process.pid,
        appId: "test",
        createdAt: new Date().toISOString(),
      }),
    );
    await assert.rejects(
      f.writer.recover(f.workspace.id, async () => {}),
      /still running/,
    );
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});
test("external generated-page changes block saves; three-way merge preserves disjoint fields and rejects competing edits", async () => {
  const f = await fixture();
  try {
    const ours = structuredClone(f.workspace.catalogs);
    ours.photography.photos[0].alt = "Local description";
    await writeFile(
      path.join(f.root, "engineeringdesign.html"),
      "external page",
    );
    await assert.rejects(
      f.publication.save(f.workspace.id, f.workspace.revision, ours),
      /changed outside/,
    );
    const theirs = structuredClone(f.workspace.catalogs);
    theirs.photography.photos[1].alt = "Remote description";
    const merged = reconcile(f.workspace.catalogs, ours, theirs);
    assert.equal(merged.photography.photos[0].alt, "Local description");
    assert.equal(merged.photography.photos[1].alt, "Remote description");
    theirs.photography.photos[0].alt = "Competing";
    assert.throws(
      () => reconcile(f.workspace.catalogs, ours, theirs),
      /Competing changes/,
    );
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});
test("legacy migration retains files and review blocks referenced cleanup; deliberate cleanup has recoverable backups", async () => {
  const f = await fixture();
  try {
    const migration = new LegacyMigration(
      f.privateDirectory,
      f.registry,
      f.transactions,
    );
    const key = f.workspace.catalogs.photography.photos[0].file;
    const filename = path.join(f.root, "photography/published", key);
    await migration.migrate(f.workspace.id, f.workspace.revision, [key]);
    assert.equal(await readFile(filename, "utf8"), "fixture asset");
    let workspace = await f.registry.read(f.workspace.id);
    let review = (await migration.review(workspace.id)).find(
      (item) => item.photoKey === key,
    )!;
    assert.equal(review.canCleanup, true);
    await writeFile(
      path.join(f.root, "reference.html"),
      `<img src="photography/published/${key}">`,
    );
    review = (await migration.review(workspace.id)).find(
      (item) => item.photoKey === key,
    )!;
    assert.ok(review.references.includes("reference.html"));
    assert.equal(review.canCleanup, false);
    await assert.rejects(
      migration.cleanup(workspace.id, workspace.revision, [key]),
      /blocked/,
    );
    await rm(path.join(f.root, "reference.html"));
    await migration.cleanup(workspace.id, workspace.revision, [key]);
    await assert.rejects(readFile(filename), /ENOENT/);
    const backup = (await f.transactions.list(workspace.id)).find(
      (item) => item.title === "Reviewed Legacy Full-Size Cleanup",
    )!;
    await f.transactions.recover(workspace.id, backup.id);
    assert.equal(await readFile(filename, "utf8"), "fixture asset");
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});
test("generated photography matches current Python-compatible artifact and local preview serves public files only", async () => {
  const f = await fixture();
  const preview = new SitePreview();
  try {
    assert.equal(
      photographyScript(f.workspace.catalogs.photography),
      await readFile(path.join(f.root, "js/photography-catalog.js"), "utf8"),
    );
    const url = await preview.start(f.root, "photography.html");
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes("Photography"));
    const prefix = url.slice(0, url.lastIndexOf("/") + 1);
    assert.equal((await fetch(prefix + "tools/private.txt")).status, 404);
    assert.equal(
      (await fetch(prefix + "js/..%2ftools/private.txt")).status,
      404,
    );
  } finally {
    await preview.stop();
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("simultaneous stale-lock recovery is serialized and never removes the new live writer lock", async () => {
  const f = await fixture();
  try {
    const lock = path.join(
      f.privateDirectory,
      "workspaces",
      f.workspace.id,
      "write.lock",
    );
    await mkdir(path.dirname(lock), { recursive: true });
    await writeFile(
      lock,
      JSON.stringify({
        version: 1,
        token: "dead-owner",
        pid: 2147483647,
        appId: "test",
        createdAt: new Date().toISOString(),
      }),
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const inside = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const first = f.writer.recover(f.workspace.id, async () => {
      entered();
      await gate;
    });
    await inside;
    await assert.rejects(
      new WorkspaceWriter(f.privateDirectory, f.registry, "other").recover(
        f.workspace.id,
        async () => {},
      ),
      /Another recovery/,
    );
    assert.equal((await f.writer.owner(f.workspace.id))?.pid, process.pid);
    release();
    await first;
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});
