import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deletePhoto, renamePhoto } from "./manage";
import { loadPortfolio } from "./portfolio";
import { copyRepository, COPY_TIMEOUT_MS } from "./test-folder";

let folder: string;
const thumbnail = (name: string) => path.join(folder, "photography", "thumbnails", name);
const toTrash = async (file: string) => {
  await rmSync(file);
};

beforeEach(() => {
  folder = copyRepository();
}, COPY_TIMEOUT_MS);
afterEach(() => rmSync(folder, { recursive: true, force: true }), COPY_TIMEOUT_MS);

describe("published photo management", () => {
  it("renames the catalog key and real WebP file, preserving private source bytes", async () => {
    const originalPath = path.join(folder, "private-original.heic");
    writeFileSync(originalPath, "not a public file");
    const expected = readFileSync(thumbnail("DSCF4154_crop.webp"));
    const view = await loadPortfolio(folder);
    const renamed = await renamePhoto(
      folder,
      view.revision,
      "DSCF4154_crop.heic",
      "DSCF4154_fix.heic",
      toTrash,
    );

    expect(renamed.ok).toBe(true);
    const after = await loadPortfolio(folder);
    expect(after.catalogs.photography.photos.at(-1)).toMatchObject({
      file: "DSCF4154_fix.heic",
      thumbnail: "DSCF4154_fix.webp",
    });
    expect(readFileSync(thumbnail("DSCF4154_fix.webp"))).toEqual(expected);
    expect(readFileSync(originalPath, "utf8")).toBe("not a public file");
    expect(() => readFileSync(thumbnail("DSCF4154_crop.webp"))).toThrow();
  });

  it("rejects an existing catalog name and does not change files", async () => {
    const view = await loadPortfolio(folder);
    const result = await renamePhoto(
      folder,
      view.revision,
      "DSCF4154_crop.heic",
      "DSCF3655_crop.jpg",
      toTrash,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "name-conflict" } });
    expect(readFileSync(thumbnail("DSCF4154_crop.webp")).byteLength).toBeGreaterThan(0);
  });

  it("removes only the public photo and its derivative, never a private original", async () => {
    const originalPath = path.join(folder, "private-original.heic");
    writeFileSync(originalPath, "untouched");
    const view = await loadPortfolio(folder);
    const deleted = await deletePhoto(folder, view.revision, "DSCF4154_crop.heic", toTrash);
    expect(deleted.ok).toBe(true);
    const after = await loadPortfolio(folder);
    expect(
      after.catalogs.photography.photos.some((photo) => photo.file === "DSCF4154_crop.heic"),
    ).toBe(false);
    expect(readFileSync(originalPath, "utf8")).toBe("untouched");
    expect(() => readFileSync(thumbnail("DSCF4154_crop.webp"))).toThrow();
  });

  it("refuses a stale rename without writing a replacement derivative", async () => {
    const view = await loadPortfolio(folder);
    writeFileSync(path.join(folder, "data/media-catalog.json"), "changed externally");
    await expect(
      renamePhoto(folder, view.revision, "DSCF4154_crop.heic", "DSCF4154_fix.heic", toTrash),
    ).rejects.toThrow();
    expect(() => readFileSync(thumbnail("DSCF4154_fix.webp"))).toThrow();
  });
});
