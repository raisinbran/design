import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadPortfolio, savePortfolio } from "./portfolio";
import { COPY_TIMEOUT_MS, copyRepository, hashFiles } from "./test-folder";

let folder: string;
beforeEach(() => {
  folder = copyRepository({ legacy: false });
}, COPY_TIMEOUT_MS);
afterEach(() => rmSync(folder, { recursive: true, force: true }), COPY_TIMEOUT_MS);

// The website as it is committed: every photo's image sits at a site path and exists.
describe("the website's photos", () => {
  it("are all at site paths whose files exist", async () => {
    const { catalogs } = await loadPortfolio(folder);
    const withImage = catalogs.photography.photos.filter((photo) => photo.thumbnail);
    expect(withImage.length).toBeGreaterThan(0);
    for (const photo of withImage) {
      expect(photo.thumbnail).toMatch(/^images\/Photography\/[^/]+$/);
      expect(existsSync(path.join(folder, photo.thumbnail!))).toBe(true);
    }
    expect(existsSync(path.join(folder, "photography/thumbnails"))).toBe(false);
  });

  // A save with no edits must leave the generated script and every other file as committed.
  it("save back to the same files when nothing was edited", async () => {
    const view = await loadPortfolio(folder);
    const before = hashFiles(folder);
    const saved = await savePortfolio(folder, view.revision, view.catalogs);
    expect(saved.ok).toBe(true);
    expect(hashFiles(folder)).toEqual(before);
  });
});
