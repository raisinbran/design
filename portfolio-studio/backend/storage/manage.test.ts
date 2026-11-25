import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deletePhoto, renamePhoto } from "./manage";
import { addPhoto } from "./add";
import { setPage } from "../../shared/library";
import { loadPortfolio, savePortfolio } from "./portfolio";
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

  it("keeps the replacement image and exact file casing on a case-only rename", async () => {
    const source = "DSCF4154_crop.webp";
    const destination = "dscf4154_crop.webp";
    const expected = readFileSync(thumbnail(source));
    const trashed: string[] = [];
    const guardedTrash = async (file: string) => {
      const [oldActual, newActual] = await Promise.all([
        realpath(file),
        realpath(thumbnail(destination)),
      ]);
      expect(oldActual).not.toBe(newActual);
      trashed.push(file);
      rmSync(file);
    };
    const view = await loadPortfolio(folder);
    const renamed = await renamePhoto(
      folder,
      view.revision,
      "DSCF4154_crop.heic",
      "dscf4154_crop.heic",
      guardedTrash,
    );

    expect(renamed.ok).toBe(true);
    expect(readFileSync(thumbnail(destination))).toEqual(expected);
    expect(readdirSync(path.join(folder, "photography", "thumbnails"))).toContain(destination);
    expect((await loadPortfolio(folder)).catalogs.photography.photos.at(-1)).toMatchObject({
      file: "dscf4154_crop.heic",
      thumbnail: destination,
    });
    expect(trashed.length).toBeLessThanOrEqual(1);
  });

  it.each(["photography", "thumbnails"] as const)(
    "refuses to rename or delete through a symlinked %s directory",
    async (linkedDirectory) => {
      const external = mkdtempSync(path.join(os.tmpdir(), "portfolio-private-images-"));
      try {
        const externalThumbnails = path.join(external, "thumbnails");
        mkdirSync(externalThumbnails);
        mkdirSync(path.join(external, "published"));
        const privateFile = path.join(externalThumbnails, "DSCF4154_crop.webp");
        writeFileSync(privateFile, "private original");
        const link =
          linkedDirectory === "photography"
            ? path.join(folder, "photography")
            : path.join(folder, "photography", "thumbnails");
        const destination = linkedDirectory === "photography" ? external : externalThumbnails;
        rmSync(link, { recursive: true });
        symlinkSync(destination, link, process.platform === "win32" ? "junction" : "dir");

        const catalogFile = path.join(folder, "data/media-catalog.json");
        const before = readFileSync(catalogFile, "utf8");
        const view = await loadPortfolio(folder);
        const trashed: string[] = [];
        const trash = async (file: string) => {
          trashed.push(file);
          rmSync(file);
        };
        const renamed = await renamePhoto(
          folder,
          view.revision,
          "DSCF4154_crop.heic",
          "DSCF4154_fix.heic",
          trash,
        );
        const deleted = await deletePhoto(folder, view.revision, "DSCF4154_crop.heic", trash);

        expect(renamed).toMatchObject({ ok: false, error: { code: "invalid" } });
        expect(deleted).toMatchObject({ ok: false, error: { code: "invalid" } });
        expect(readFileSync(privateFile, "utf8")).toBe("private original");
        expect(readFileSync(catalogFile, "utf8")).toBe(before);
        expect(trashed).toEqual([]);
      } finally {
        rmSync(external, { recursive: true, force: true });
      }
    },
  );

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
    const catalogFile = path.join(folder, "data/media-catalog.json");
    const externallyEdited = readFileSync(catalogFile, "utf8").replace(
      "LAX SkyLink people mover viaduct",
      "Externally edited viaduct",
    );
    writeFileSync(catalogFile, externallyEdited);
    const renamed = await renamePhoto(
      folder,
      view.revision,
      "DSCF4154_crop.heic",
      "DSCF4154_fix.heic",
      toTrash,
    );
    expect(renamed).toMatchObject({ ok: false, error: { code: "changed-outside" } });
    expect(() => readFileSync(thumbnail("DSCF4154_fix.webp"))).toThrow();
  });
  it("preserves the selected JPEG format while renaming its published asset", async () => {
    const view = await loadPortfolio(folder);
    const jpeg = {
      bytes: Buffer.from("test jpeg bytes"),
      width: 800,
      height: 600,
      format: "jpg" as const,
    };
    const added = await addPhoto(
      folder,
      {
        kind: "new",
        revision: view.revision,
        sourceId: "",
        name: "Studio_7001",
        format: "jpg",
        alt: "test",
        tags: ["Day"],
      },
      jpeg,
    );
    if (!added.ok) throw new Error(added.error.message);
    const renamed = await renamePhoto(
      folder,
      added.value.view.revision,
      "Studio_7001.jpg",
      "Studio_7002.jpg",
      toTrash,
    );
    expect(renamed.ok).toBe(true);
    expect(readFileSync(thumbnail("Studio_7002.jpg"))).toEqual(jpeg.bytes);
    expect(() => readFileSync(thumbnail("Studio_7001.jpg"))).toThrow();
    const current = await loadPortfolio(folder);
    expect(current.catalogs.photography.photos.at(-1)).toMatchObject({
      file: "Studio_7002.jpg",
      thumbnail: "Studio_7002.jpg",
    });
  });

  // Another page may show the same file, so trashing or renaming it must be refused.
  it("refuses to rename or delete a photo whose file another page uses", async () => {
    const view = await loadPortfolio(folder);
    const [first] = view.catalogs.engineering.projects;
    const used = {
      ...view.catalogs,
      engineering: {
        ...view.catalogs.engineering,
        projects: [
          {
            ...first,
            media: [
              ...first.media,
              {
                kind: "image" as const,
                src: "photography/thumbnails/DSCF4154_crop.webp",
                alt: "",
                caption: "",
                credit: "",
              },
            ],
          },
          ...view.catalogs.engineering.projects.slice(1),
        ],
      },
    };
    const saved = await savePortfolio(folder, view.revision, used);
    if (!saved.ok) throw new Error(saved.error.message);

    const renamed = await renamePhoto(
      folder,
      saved.value.revision,
      "DSCF4154_crop.heic",
      "other.heic",
      toTrash,
    );
    const deleted = await deletePhoto(folder, saved.value.revision, "DSCF4154_crop.heic", toTrash);

    expect(renamed).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("also used by Engineering") },
    });
    expect(deleted).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("cannot be deleted") },
    });
    expect(() => readFileSync(thumbnail("DSCF4154_crop.webp"))).not.toThrow();
  });

  // Once the library file exists, a renamed or deleted photo must not leave a stale item behind.
  it.each(["rename", "delete"])("keeps the library in step on %s", async (action) => {
    const first = await loadPortfolio(folder);
    const oldSrc = "photography/thumbnails/DSCF4154_crop.webp";
    const assigned = await savePortfolio(
      folder,
      first.revision,
      setPage(first.catalogs, oldSrc, "archive", true),
    );
    if (!assigned.ok) throw new Error(assigned.error.message);
    const { revision } = assigned.value;

    const changed =
      action === "rename"
        ? await renamePhoto(folder, revision, "DSCF4154_crop.heic", "DSCF4154_fix.heic", toTrash)
        : await deletePhoto(folder, revision, "DSCF4154_crop.heic", toTrash);

    expect(changed.ok).toBe(true);
    const items = (await loadPortfolio(folder)).catalogs.library.items;
    expect(items.some((item) => item.src === oldSrc)).toBe(false);
    const moved = items.find((item) => item.src === "photography/thumbnails/DSCF4154_fix.webp");
    if (action === "rename")
      expect(moved).toMatchObject({
        pages: ["photography", "archive"],
        photoFile: "DSCF4154_fix.heic",
      });
    else expect(moved).toBeUndefined();
  });
});
