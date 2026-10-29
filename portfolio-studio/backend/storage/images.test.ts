import { realpathSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveSiteImage } from "./images";
import { copyRepository } from "./test-folder";

let folder: string;
beforeAll(() => {
  folder = copyRepository();
  // A junction needs no extra rights on Windows; elsewhere it is a plain symlink.
  symlinkSync(path.join(folder, "assets"), path.join(folder, "images/linked-assets"), "junction");
});
afterAll(() => rmSync(folder, { recursive: true, force: true }));

describe("portfolio image protocol", () => {
  it("image protocol serves only allowed files", async () => {
    const thumbnail = "portfolio://site/photography/thumbnails/DSCF3655_crop.jpg.webp";
    const refused = [
      "portfolio://site/data/media-catalog.json",
      "portfolio://site/images/..%2Fassets/homepage-2026/grape-default.png",
      "portfolio://site/images/linked-assets/homepage-2026/grape-default.png",
      "portfolio://site/images/HCPD/desktop.ini",
    ];

    const allowed = await resolveSiteImage(folder, thumbnail);
    const results = await Promise.all(refused.map((url) => resolveSiteImage(folder, url)));

    expect(allowed).toBe(
      realpathSync(path.join(folder, "photography/thumbnails/DSCF3655_crop.jpg.webp")),
    );
    expect(results).toEqual(refused.map(() => null));
  });
});
