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
      "images/a/b/c.webp",
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
    const item = (await loadPortfolio(folder)).catalogs.library?.items.find(
      (entry) => entry.src === SITE_PATH,
    );
    expect(item).toBeDefined();
    expect(item?.pages).not.toContain("photography");
  });

  // Another page showing the photo must follow an edit, and must never see the old file's bytes change.
  it("writes an edit of a shared photo to a new file and repoints every page", async () => {
    const view = await withPathPhoto();
    const catalogs = structuredClone(view.catalogs);
    const project = catalogs.archive.collections[0];
    project.media.push({
      id: "shared",
      src: SITE_PATH,
      alt: "harbor",
      caption: "",
      credit: "",
      cropMode: "natural",
      displayRatio: null,
      position: "50% 50%",
      prominence: "normal",
    });
    const shared = await savePortfolio(folder, view.revision, catalogs);
    if (!shared.ok) throw new Error(shared.error.message);

    const next = Buffer.from("edited");
    const replaced = await addPhoto(
      folder,
      { kind: "replace", revision: shared.value.revision, sourceId: "", photoKey: "Harbor.webp" },
      { ...image, bytes: next },
    );
    expect(replaced.ok).toBe(true);
    const edited = "images/Photography/Harbor-edit.webp";
    expect(readFileSync(path.join(folder, edited))).toEqual(next);
    expect(readFileSync(path.join(folder, SITE_PATH))).toEqual(bytes);
    const after = (await loadPortfolio(folder)).catalogs;
    expect(after.photography.photos.at(-1)?.thumbnail).toBe(edited);
    expect(after.archive.collections[0].media.at(-1)?.src).toBe(edited);
    expect(after.library.items.some((item) => item.src === SITE_PATH)).toBe(false);
  });

  // The Photo Editor may send a photo to pages other than Photography, or to several at once.
  describe("added to chosen pages", () => {
    const request = async (
      pages: ("photography" | "engineering" | "archive")[],
      tags: string[],
    ) => {
      const view = await loadPortfolio(folder);
      return addPhoto(
        folder,
        {
          kind: "new",
          revision: view.revision,
          sourceId: "",
          name: "Studio_8001",
          format: "webp",
          alt: "a studio",
          tags,
          pages,
        },
        image,
      );
    };
    const itemFor = async () =>
      (await loadPortfolio(folder)).catalogs.library.items.find(
        (item) => item.src === "images/Photography/Studio_8001.webp",
      );

    it("keeps a photo off Photography when that page is not chosen", async () => {
      const before = (await loadPortfolio(folder)).catalogs.photography.photos.length;
      expect(await request(["engineering"], [])).toMatchObject({ ok: true });
      const { catalogs } = await loadPortfolio(folder);
      expect(catalogs.photography.photos).toHaveLength(before);
      expect(readFileSync(path.join(folder, "images/Photography/Studio_8001.webp"))).toEqual(bytes);
      expect(await itemFor()).toMatchObject({ pages: ["engineering"], alt: "a studio" });
    });

    it("adds to Photography and the other pages together", async () => {
      expect(await request(["photography", "archive"], ["Day"])).toMatchObject({ ok: true });
      const { catalogs } = await loadPortfolio(folder);
      expect(catalogs.photography.photos.at(-1)).toMatchObject({
        file: "Studio_8001.webp",
        tags: ["Day"],
      });
      expect((await itemFor())?.pages).toEqual(["photography", "archive"]);
    });

    it("needs a page", async () => {
      expect(await request([], ["Day"])).toMatchObject({ ok: false });
    });

    it("refuses a name already in the library unless overwriting", async () => {
      expect(await request(["engineering"], [])).toMatchObject({ ok: true });
      expect(await request(["archive"], [])).toMatchObject({
        ok: false,
        error: { code: "name-conflict" },
      });
    });
  });
});
