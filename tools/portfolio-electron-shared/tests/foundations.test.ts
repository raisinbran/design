import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  WorkspaceRegistry,
  atomicWrite,
  workspaceFile,
} from "../src/main/files";
import { validatePhotoCatalog } from "../src/validation";
import { AppearanceStore } from "../src/main/appearance";
test("loads all real catalogs and preserves extension fields", async () => {
  const registry = new WorkspaceRegistry();
  const workspace = await registry.select(process.cwd());
  for (const [section, name] of [
    ["photography", "media"],
    ["engineering", "engineering"],
    ["archive", "archive"],
  ] as const) {
    assert.deepEqual(
      workspace.catalogs[section],
      JSON.parse(
        await readFile(
          path.join(process.cwd(), "data", `${name}-catalog.json`),
          "utf8",
        ),
      ),
    );
  }
  assert.deepEqual(
    (await registry.read(workspace.id)).catalogs,
    workspace.catalogs,
  );
  await assert.rejects(registry.read("unselected"), /Select a portfolio/);
});
test("rejects unsafe filenames and malformed single-image publications", () => {
  const base = {
    schemaVersion: 1,
    photoTags: [],
    photos: [
      {
        file: "image.jpg",
        alt: "",
        tags: [],
        visible: true,
        featured: false,
        aspectRatio: 1,
        displayPriority: "normal",
      },
    ],
  };
  assert.throws(
    () =>
      validatePhotoCatalog({
        ...base,
        photos: [{ ...base.photos[0], file: "../image.jpg" }],
      }),
    /safe filename/,
  );
  assert.throws(
    () =>
      validatePhotoCatalog({
        ...base,
        photos: [{ ...base.photos[0], publishedImage: true }],
      }),
    /requires/,
  );
  assert.throws(
    () =>
      validatePhotoCatalog({
        ...base,
        photos: [{ ...base.photos[0], publishedImage: "false" }],
      }),
    /marker/,
  );
  const extended = { ...base, extra: 123 };
  assert.equal(validatePhotoCatalog(extended).extra, 123);
});
test("scoped filesystem rejects traversal and symlink writes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "portfolio-safe-"));
  try {
    await assert.rejects(workspaceFile(directory, "../outside.json"), /inside/);
    await symlink(
      os.tmpdir(),
      path.join(directory, "linked"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(
      workspaceFile(directory, "linked/secret.json"),
      /Symbolic/,
    );
    await atomicWrite(path.join(directory, "private.json"), "first");
    await atomicWrite(path.join(directory, "private.json"), "second");
    assert.equal(
      await readFile(path.join(directory, "private.json"), "utf8"),
      "second",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("appearance persists and rejects arbitrary values", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "portfolio-theme-"));
  try {
    const store = new AppearanceStore(directory);
    assert.equal((await store.read()).theme, "system");
    await store.set("dark");
    assert.equal((await new AppearanceStore(directory).read()).theme, "dark");
    await assert.rejects(store.set("invalid"), /Unknown/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
