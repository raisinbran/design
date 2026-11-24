import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveSiteImage } from "./images";
import { COPY_TIMEOUT_MS, copyRepository } from "./test-folder";

let folder: string;
beforeAll(() => {
  folder = copyRepository();
  // A junction needs no extra rights on Windows; elsewhere it is a plain symlink.
  symlinkSync(path.join(folder, "assets"), path.join(folder, "images/linked-assets"), "junction");
}, COPY_TIMEOUT_MS);
afterAll(() => rmSync(folder, { recursive: true, force: true }), COPY_TIMEOUT_MS);

describe("resolveSiteImage", () => {
  // The renderer may load only image files inside the image folders, so a page cannot read the
  // catalogs, other files in those folders or files outside them.
  it("resolves only image files inside image folders", async () => {
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
      realpathSync.native(path.join(folder, "photography/thumbnails/DSCF3655_crop.jpg.webp")),
    );
    expect(results).toEqual(refused.map(() => null));
  });

  it.each(["photography", "thumbnails", "images"] as const)(
    "refuses image protocol reads through a symlinked %s directory",
    async (linkedDirectory) => {
      const website = copyRepository();
      const external = mkdtempSync(path.join(os.tmpdir(), "portfolio-private-images-"));
      try {
        const externalImages =
          linkedDirectory === "images" ? external : path.join(external, "thumbnails");
        if (externalImages !== external) mkdirSync(externalImages);
        const privateFile = path.join(externalImages, "private-original.jpg");
        writeFileSync(privateFile, "private original");
        const link =
          linkedDirectory === "photography"
            ? path.join(website, "photography")
            : linkedDirectory === "thumbnails"
              ? path.join(website, "photography", "thumbnails")
              : path.join(website, "images");
        const destination = linkedDirectory === "photography" ? external : externalImages;
        rmSync(link, { recursive: true });
        symlinkSync(destination, link, "junction");

        const url =
          linkedDirectory === "images"
            ? "portfolio://site/images/private-original.jpg"
            : "portfolio://site/photography/thumbnails/private-original.jpg";
        expect(await resolveSiteImage(website, url)).toBeNull();
        expect(readFileSync(privateFile, "utf8")).toBe("private original");
      } finally {
        rmSync(website, { recursive: true, force: true });
        rmSync(external, { recursive: true, force: true });
      }
    },
    COPY_TIMEOUT_MS,
  );
});
