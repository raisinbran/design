import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addPhoto } from "./add";
import { loadPortfolio, savePortfolio } from "./portfolio";
import { COPY_TIMEOUT_MS, copyRepository, hashFiles } from "./test-folder";

let folder: string;
beforeEach(() => {
  folder = copyRepository();
}, COPY_TIMEOUT_MS);
afterEach(() => rmSync(folder, { recursive: true, force: true }), COPY_TIMEOUT_MS);

// Adding writes the bytes it is given, so these need not be a real WebP file.
const image = {
  bytes: Buffer.from("rendered image"),
  width: 800,
  height: 600,
  format: "webp" as const,
};

describe("addPhoto", () => {
  // A new photo must reach the gallery with its image, catalog entry and tags, while no other site
  // file changes.
  it("writes the image, entry and new tag", async () => {
    const before = hashFiles(folder);
    const { revision, catalogs: loaded } = await loadPortfolio(folder);

    const added = await addPhoto(
      folder,
      {
        kind: "new",
        revision,
        sourceId: "",
        name: "IMG_0001",
        format: "webp",
        alt: "harbor",
        tags: ["Dusk", "Harbor"],
      },
      image,
    );

    expect(added).toMatchObject({ ok: true, value: { photoKey: "IMG_0001.webp" } });
    const after = hashFiles(folder);
    const changed = Object.keys(after).filter((file) => after[file] !== before[file]);
    expect(changed.sort()).toEqual([
      "data/media-catalog.json",
      "js/photography-catalog.js",
      "photography/thumbnails/IMG_0001.webp",
    ]);
    expect(readFileSync(path.join(folder, "photography/thumbnails/IMG_0001.webp"))).toEqual(
      image.bytes,
    );
    const { catalogs } = await loadPortfolio(folder);
    // "Dusk" is already a tag, so only "Harbor" is appended.
    expect(catalogs.photography.photoTags).toEqual([...loaded.photography.photoTags, "Harbor"]);
    expect(catalogs.photography.photos.at(-1)).toMatchObject({
      file: "IMG_0001.webp",
      alt: "harbor",
      visible: true,
      tags: ["Dusk", "Harbor"],
      thumbnail: "IMG_0001.webp",
      thumbnailWidth: 800,
      thumbnailHeight: 600,
    });
  });

  it("refuses to publish through a symlinked thumbnail directory", async () => {
    const external = mkdtempSync(path.join(os.tmpdir(), "portfolio-private-images-"));
    try {
      const thumbnails = path.join(folder, "photography", "thumbnails");
      rmSync(thumbnails, { recursive: true });
      symlinkSync(external, thumbnails, process.platform === "win32" ? "junction" : "dir");
      const view = await loadPortfolio(folder);

      const added = await addPhoto(
        folder,
        {
          kind: "new",
          revision: view.revision,
          sourceId: "",
          name: "Studio_9901",
          format: "webp",
          alt: "sample",
          tags: ["Day"],
        },
        image,
      );

      expect(added).toMatchObject({ ok: false, error: { code: "invalid" } });
      expect(existsSync(path.join(external, "Studio_9901.webp"))).toBe(false);
      expect((await loadPortfolio(folder)).catalogs.photography.photos).toEqual(
        view.catalogs.photography.photos,
      );
    } finally {
      rmSync(external, { recursive: true, force: true });
    }
  });

  // The first photo is DSCF3655_crop.jpg; the name differs only in case.
  it("refuses a name conflict without Overwrite", async () => {
    const before = hashFiles(folder);
    const { revision } = await loadPortfolio(folder);

    const added = await addPhoto(
      folder,
      {
        kind: "new",
        revision,
        sourceId: "",
        name: "dscf3655_crop",
        format: "jpg",
        alt: "peaks",
        tags: [],
      },
      { ...image, format: "jpg" },
    );

    expect(added).toMatchObject({ ok: false, error: { code: "name-conflict" } });
    expect(hashFiles(folder)).toEqual(before);
  });

  // Overwrite keeps the catalog position and user settings when the selected encoding matches.
  it("replaces a published WebP photo in place on Overwrite", async () => {
    const view = await loadPortfolio(folder);
    const first = await addPhoto(
      folder,
      {
        kind: "new",
        revision: view.revision,
        sourceId: "",
        name: "Studio_4001",
        format: "webp",
        alt: "initial",
        tags: ["Day"],
      },
      image,
    );
    if (!first.ok) throw new Error(first.error.message);
    const viewWithPhoto = first.value.view;
    const last = viewWithPhoto.catalogs.photography.photos.at(-1)!;
    Object.assign(last, { visible: false, displayPriority: "featured", locked: true });
    const saved = await savePortfolio(folder, viewWithPhoto.revision, viewWithPhoto.catalogs);
    if (!saved.ok) throw new Error(saved.error.message);
    const count = saved.value.catalogs.photography.photos.length;

    const replaced = await addPhoto(
      folder,
      {
        kind: "new",
        revision: saved.value.revision,
        sourceId: "",
        name: "Studio_4001",
        format: "webp",
        alt: "replacement",
        tags: ["Dusk"],
        overwrite: true,
      },
      image,
    );
    expect(replaced.ok).toBe(true);
    const photos = (await loadPortfolio(folder)).catalogs.photography.photos;
    expect(photos).toHaveLength(count);
    expect(photos.at(-1)).toMatchObject({
      file: "Studio_4001.webp",
      alt: "replacement",
      tags: ["Dusk"],
      visible: false,
      displayPriority: "featured",
      locked: true,
      thumbnail: "Studio_4001.webp",
    });
    expect(readFileSync(path.join(folder, "photography/thumbnails/Studio_4001.webp"))).toEqual(
      image.bytes,
    );
  });

  // DSCF3655_crop.jpg is the first photo, described as "mountains"; its gallery image is 450 × 800.
  it("keeps the photo's details on Edit Image", async () => {
    const view = await loadPortfolio(folder);
    Object.assign(view.catalogs.photography.photos[0], {
      visible: false,
      displayPriority: "featured",
      locked: true,
    });
    const saved = await savePortfolio(folder, view.revision, view.catalogs);
    if (!saved.ok) throw new Error(saved.error.message);
    const count = saved.value.catalogs.photography.photos.length;

    const replaced = await addPhoto(
      folder,
      {
        kind: "replace",
        revision: saved.value.revision,
        sourceId: "",
        photoKey: "DSCF3655_crop.jpg",
      },
      image,
    );

    expect(replaced.ok).toBe(true);
    const { photos } = (await loadPortfolio(folder)).catalogs.photography;
    expect(photos).toHaveLength(count);
    expect(photos[0]).toMatchObject({
      file: "DSCF3655_crop.jpg",
      alt: "mountains",
      tags: ["Moody", '"It\'s just rocks"'],
      visible: false,
      displayPriority: "featured",
      locked: true,
      thumbnail: "DSCF3655_crop.jpg.webp",
      thumbnailWidth: 800,
      thumbnailHeight: 600,
    });
    expect(
      readFileSync(path.join(folder, "photography/thumbnails/DSCF3655_crop.jpg.webp")),
    ).toEqual(image.bytes);
  });
  it("rejects an image whose encoded format differs from the filename", async () => {
    const view = await loadPortfolio(folder);
    const added = await addPhoto(
      folder,
      {
        kind: "new",
        revision: view.revision,
        sourceId: "",
        name: "Studio_5001",
        format: "png",
        alt: "test image",
        tags: ["Day"],
      },
      image,
    );
    expect(added).toMatchObject({ ok: false, error: { code: "invalid" } });
  });

  it("refuses an imported Name that repeats the source extension", async () => {
    const view = await loadPortfolio(folder);
    const result = await addPhoto(
      folder,
      {
        kind: "new",
        revision: view.revision,
        sourceId: "",
        name: "DSCF4154.heic",
        format: "webp",
        alt: "test image",
        tags: ["Day"],
      },
      image,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "invalid" } });
  });

  it.each(["jpg", "png"] as const)(
    "saves a new %s publication with the true file extension",
    async (format) => {
      const view = await loadPortfolio(folder);
      const result = await addPhoto(
        folder,
        {
          kind: "new",
          revision: view.revision,
          sourceId: "",
          name: "DSCF_5001",
          format,
          alt: "sample",
          tags: ["Day"],
        },
        { ...image, format },
      );
      expect(result.ok).toBe(true);
      const filename = `DSCF_5001.${format}`;
      const current = await loadPortfolio(folder);
      expect(current.catalogs.photography.photos.at(-1)).toMatchObject({
        file: filename,
        thumbnail: filename,
      });
      expect(readFileSync(path.join(folder, "photography/thumbnails", filename))).toEqual(
        image.bytes,
      );
    },
  );
});
