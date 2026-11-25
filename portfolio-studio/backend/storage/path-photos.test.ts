import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addPhoto } from "./add";
import { deletePhoto, renamePhoto } from "./manage";
import { loadPortfolio, savePortfolio } from "./portfolio";
import { COPY_TIMEOUT_MS, copyRepository, hashFiles } from "./test-folder";

let folder: string;
beforeEach(() => {
  folder = copyRepository();
}, COPY_TIMEOUT_MS);
afterEach(() => rmSync(folder, { recursive: true, force: true }), COPY_TIMEOUT_MS);

const bytes = Buffer.from("rendered image");
const image = { bytes, width: 800, height: 600, format: "webp" as const };
const SITE_PATH = "images/Photography/Harbor.webp";
const never = async () => {
  throw new Error("must not trash");
};

// A photo whose thumbnail is a site path, saved with its image so the folder is created.
async function withPathPhoto() {
  const view = await loadPortfolio(folder);
  const photos = view.catalogs.photography.photos;
  const entry = { ...photos[0], file: "Harbor.webp", thumbnail: SITE_PATH, alt: "harbor" };
  const catalogs = {
    ...view.catalogs,
    photography: { ...view.catalogs.photography, photos: [...photos, entry] },
  };
  const saved = await savePortfolio(folder, view.revision, catalogs, { [SITE_PATH]: bytes });
  if (!saved.ok) throw new Error(saved.error.message);
  return saved.value;
}

describe("photos at a site path", () => {
  it("creates the folder and writes the image", async () => {
    await withPathPhoto();
    expect(readFileSync(path.join(folder, SITE_PATH))).toEqual(bytes);
  });

  it("refuses image paths outside images/<folder>/<file>", async () => {
    const view = await loadPortfolio(folder);
    for (const bad of ["images/../x.webp", "images/a/b/c.webp", "images/x.webp", "js/x.webp"]) {
      const saved = await savePortfolio(folder, view.revision, view.catalogs, { [bad]: bytes });
      expect(saved.ok).toBe(false);
    }
  });

  it("rejects a thumbnail path that leaves images/", async () => {
    const view = await loadPortfolio(folder);
    for (const thumbnail of [
      "../x.webp",
      "images/../x.webp",
      "images/a.webp",
      "/images/a/b.webp",
    ]) {
      const photos = [{ ...view.catalogs.photography.photos[0], thumbnail }];
      const saved = await savePortfolio(folder, view.revision, {
        ...view.catalogs,
        photography: { ...view.catalogs.photography, photos },
      });
      expect(saved.ok).toBe(false);
    }
  });

  it("replaces the image in place on Edit Image", async () => {
    const view = await withPathPhoto();
    const next = Buffer.from("edited");
    const replaced = await addPhoto(
      folder,
      {
        kind: "replace",
        revision: view.revision,
        sourceId: "",
        photoKey: "Harbor.webp",
      },
      { ...image, bytes: next },
    );
    expect(replaced.ok).toBe(true);
    expect(readFileSync(path.join(folder, SITE_PATH))).toEqual(next);
    expect(existsSync(path.join(folder, "photography/thumbnails/Harbor.webp"))).toBe(false);
  });

  it("renames only the catalog name and keeps the file", async () => {
    const view = await withPathPhoto();
    const before = hashFiles(folder);
    const renamed = await renamePhoto(folder, view.revision, "Harbor.webp", "Dock.webp", never);
    expect(renamed.ok).toBe(true);
    const after = hashFiles(folder);
    expect(after[SITE_PATH]).toBe(before[SITE_PATH]);
    const photo = (await loadPortfolio(folder)).catalogs.photography.photos.at(-1)!;
    expect(photo).toMatchObject({ file: "Dock.webp", thumbnail: SITE_PATH });
  });

  it("deletes only the entry and leaves the file", async () => {
    const view = await withPathPhoto();
    const deleted = await deletePhoto(folder, view.revision, "Harbor.webp", never);
    expect(deleted).toMatchObject({ ok: true });
    expect(existsSync(path.join(folder, SITE_PATH))).toBe(true);
    const photos = (await loadPortfolio(folder)).catalogs.photography.photos;
    expect(photos.some((photo) => photo.file === "Harbor.webp")).toBe(false);
  });
});
