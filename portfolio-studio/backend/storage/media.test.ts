import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importMedia } from "./media";

let site: string;
let source: string;
beforeEach(() => {
  site = mkdtempSync(path.join(os.tmpdir(), "media-site-"));
  source = mkdtempSync(path.join(os.tmpdir(), "media-src-"));
});
afterEach(() => {
  rmSync(site, { recursive: true, force: true });
  rmSync(source, { recursive: true, force: true });
});

const original = (name: string, text: string) => {
  const file = path.join(source, name);
  writeFileSync(file, text);
  return file;
};
const encode = (bytes: string) => async () => Buffer.from(bytes);
const read = (src: string) => readFileSync(path.join(site, src), "utf8");

describe("importMedia", () => {
  // Images are re-encoded to WebP under the owner's id, and the chosen original is left alone.
  it("writes an image as WebP and leaves the original", async () => {
    const file = original("IMG 1242.heic", "raw");

    const added = await importMedia(site, "engineering", "collapseSignal", [file], encode("webp1"));

    expect(added).toEqual([{ kind: "image", src: "images/collapseSignal/IMG 1242.webp" }]);
    expect(read(added[0].src)).toBe("webp1");
    expect(readFileSync(file, "utf8")).toBe("raw");
  });

  // Importing the same photo twice must not pile up copies, but a different photo with the same
  // name must not overwrite the first.
  it("reuses identical bytes and numbers a name taken by different bytes", async () => {
    const file = original("a.jpg", "x");
    const [first] = await importMedia(site, "archive", "collapseArt", [file], encode("one"));
    const [again] = await importMedia(site, "archive", "collapseArt", [file], encode("one"));
    const [other] = await importMedia(site, "archive", "collapseArt", [file], encode("two"));

    expect(again.src).toBe(first.src);
    expect(other.src).toBe("images/collapseArt/a-2.webp");
    expect(read(first.src)).toBe("one");
  });

  it("copies a video unchanged", async () => {
    const file = original("clip.MP4", "video bytes");

    const [added] = await importMedia(site, "engineering", "collapseBolt", [file], encode(""));

    expect(added).toEqual({ kind: "video", src: "video/collapseBolt/clip.mp4" });
    expect(read(added.src)).toBe("video bytes");
  });

  it("refuses a video on the Archive page, an unknown type and an unsafe id", async () => {
    const video = original("clip.mp4", "v");
    const pdf = original("doc.pdf", "p");
    const image = original("a.jpg", "x");

    await expect(importMedia(site, "archive", "collapseArt", [video], encode(""))).rejects.toThrow(
      /not a file type/,
    );
    await expect(importMedia(site, "engineering", "x", [pdf], encode(""))).rejects.toThrow(
      /not a file type/,
    );
    await expect(importMedia(site, "engineering", "../up", [image], encode(""))).rejects.toThrow(
      /not a valid/,
    );
  });
});
