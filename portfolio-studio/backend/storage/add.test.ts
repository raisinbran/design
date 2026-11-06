import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addPhoto } from "./add";
import { loadPortfolio, savePortfolio } from "./portfolio";
import { copyRepository, hashFiles } from "./test-folder";

let folder: string;
beforeEach(() => {
  folder = copyRepository();
});
afterEach(() => rmSync(folder, { recursive: true, force: true }));

// Adding writes the bytes it is given, so these need not be a real WebP file.
const image = { bytes: Buffer.from("rendered image"), width: 800, height: 600 };

describe("adding photos", () => {
  it("add writes image, entry and tag", async () => {
    const before = hashFiles(folder);
    const { revision, catalogs: loaded } = await loadPortfolio(folder);

    const added = await addPhoto(
      folder,
      {
        kind: "new",
        revision,
        sourceId: "",
        name: "IMG_0001.HEIC",
        alt: "harbor",
        tags: ["Dusk", "Harbor"],
      },
      image,
    );

    expect(added).toMatchObject({ ok: true, value: { photoKey: "IMG_0001.HEIC" } });
    const after = hashFiles(folder);
    const changed = Object.keys(after).filter((file) => after[file] !== before[file]);
    expect(changed.sort()).toEqual([
      "data/media-catalog.json",
      "js/photography-catalog.js",
      "photography/thumbnails/IMG_0001.HEIC.webp",
    ]);
    expect(readFileSync(path.join(folder, "photography/thumbnails/IMG_0001.HEIC.webp"))).toEqual(
      image.bytes,
    );
    const { catalogs } = await loadPortfolio(folder);
    // "Dusk" is already a tag, so only "Harbor" is appended.
    expect(catalogs.photography.photoTags).toEqual([...loaded.photography.photoTags, "Harbor"]);
    expect(catalogs.photography.photos.at(-1)).toMatchObject({
      file: "IMG_0001.HEIC",
      alt: "harbor",
      visible: true,
      tags: ["Dusk", "Harbor"],
      thumbnail: "IMG_0001.HEIC.webp",
      thumbnailWidth: 800,
      thumbnailHeight: 600,
    });
  });

  // The first photo is DSCF3655_crop.jpg; the name differs only in case.
  it("name conflict never overwrites without choice", async () => {
    const before = hashFiles(folder);
    const { revision } = await loadPortfolio(folder);

    const added = await addPhoto(
      folder,
      { kind: "new", revision, sourceId: "", name: "dscf3655_crop.jpg", alt: "peaks", tags: [] },
      image,
    );

    expect(added).toMatchObject({ ok: false, error: { code: "name-conflict" } });
    expect(hashFiles(folder)).toEqual(before);
  });

  // DSCF3655_crop.jpg is the first photo; Overwrite keeps its place and its visibility, priority and lock.
  it("overwrite replaces the photo in place", async () => {
    const view = await loadPortfolio(folder);
    Object.assign(view.catalogs.photography.photos[0], {
      visible: false,
      displayPriority: "featured",
      locked: true,
    });
    const saved = await savePortfolio(folder, view.revision, view.catalogs);
    if (!saved.ok) throw new Error(saved.error.message);
    const count = saved.value.catalogs.photography.photos.length;

    const added = await addPhoto(
      folder,
      {
        kind: "new",
        revision: saved.value.revision,
        sourceId: "",
        name: "DSCF3655_crop.jpg",
        alt: "peaks",
        tags: ["Day"],
        overwrite: true,
      },
      image,
    );

    expect(added.ok).toBe(true);
    const { photos } = (await loadPortfolio(folder)).catalogs.photography;
    expect(photos).toHaveLength(count);
    expect(photos[0]).toMatchObject({
      file: "DSCF3655_crop.jpg",
      alt: "peaks",
      tags: ["Day"],
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

  // DSCF3655_crop.jpg is the first photo, described as "mountains"; its gallery image is 450 × 800.
  it("edit image keeps the photo's details", async () => {
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
});
