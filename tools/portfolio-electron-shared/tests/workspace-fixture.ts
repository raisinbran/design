import { mkdtemp, mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { WorkspaceRegistry } from "../src/main/files";
import { WorkspaceWriter } from "../src/main/workspace-lock";
import { Transactions } from "../src/main/transactions";
import { PublicationService } from "../src/main/publication";
import { ProcessingService } from "../src/main/processing";
import { renderImage } from "../src/processing/render-image";
const require = createRequire(import.meta.url);
const sharp: typeof import("sharp") = require("../../portfolio-studio-electron/node_modules/sharp");
export async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "portfolio-publish-"));
  const root = path.join(directory, "site");
  const privateDirectory = path.join(directory, "private");
  await mkdir(path.join(root, "data"), { recursive: true });
  await mkdir(path.join(root, "js"));
  for (const relative of [
    "data/media-catalog.json",
    "data/engineering-catalog.json",
    "data/archive-catalog.json",
    "js/photography-catalog.js",
    "js/archive-photo-settings.js",
    "engineeringdesign.html",
    "creativedesign.html",
    "photography.html",
  ])
    await copyFile(
      path.join(process.cwd(), relative),
      path.join(root, relative),
    );
  const registry = new WorkspaceRegistry();
  let workspace = await registry.select(root);
  const assets = new Set<string>();
  for (const photo of workspace.catalogs.photography.photos) {
    assets.add(`photography/published/${photo.file}`);
    if (photo.thumbnail)
      assets.add(`photography/thumbnails/${photo.thumbnail}`);
  }
  for (const project of workspace.catalogs.engineering.projects) {
    assets.add(project.cover);
    project.media.forEach((media) => assets.add(media.src));
  }
  for (const collection of workspace.catalogs.archive.collections) {
    assets.add(collection.cover);
    collection.media.forEach((media) => assets.add(media.src));
  }
  for (const relative of assets) {
    if (!relative) continue;
    const filename = path.join(root, relative);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, "fixture asset");
  }
  const original = path.join(directory, "Original.png");
  await sharp({
    create: { width: 1200, height: 900, channels: 3, background: "#126899" },
  })
    .png()
    .toFile(original);
  const originals = new Map([["source", original]]);
  const processing = new ProcessingService(
    originals,
    privateDirectory,
    (request: unknown, progress) => {
      const job = request as { originalPath: string; recipe: unknown };
      return renderImage(job.originalPath, job.recipe, progress);
    },
  );
  const writer = new WorkspaceWriter(privateDirectory, registry, "test");
  const transactions = new Transactions(privateDirectory, registry, writer);
  const publication = new PublicationService(
    privateDirectory,
    registry,
    transactions,
    processing,
  );
  return {
    directory,
    root,
    privateDirectory,
    registry,
    workspace,
    original,
    originals,
    processing,
    writer,
    transactions,
    publication,
  };
}
