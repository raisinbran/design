import { describe, expect, it } from "vitest";
import type { Catalogs } from "../backend/catalogs/schema";
import {
  deriveLibrary,
  descriptionOf,
  describeUses,
  pagesInUse,
  removeItem,
  repairLibrary,
  setAlt,
  setPage,
} from "./library";

const photo = (file: string, thumbnail?: string) => ({
  file,
  alt: "a photo",
  visible: true,
  displayPriority: "normal" as const,
  tags: [],
  ...(thumbnail ? { thumbnail } : {}),
});
const engineeringImage = (src: string, alt = "") => ({
  kind: "image" as const,
  src,
  alt,
  caption: "",
  credit: "",
});
const project = {
  id: "p",
  title: "Caltrain",
  heading: "",
  context: "",
  bodyHtml: "",
  cover: "images/cover.webp",
  coverPosition: "50% 50%",
  media: [engineeringImage("images/a.webp"), engineeringImage("photography/thumbnails/x.webp")],
  visible: true,
  expanded: false,
  hero: false,
};
const base: Catalogs = {
  photography: {
    schemaVersion: 1,
    photoTags: [],
    photos: [photo("x.jpg", "x.webp"), photo("old.jpg")],
  },
  engineering: { schemaVersion: 1, projects: [project] },
  archive: { schemaVersion: 1, collections: [] },
  library: { schemaVersion: 1, items: [] },
};

describe("library", () => {
  // The site must keep working with no library file, so derive has to name every use.
  it("derives an item for each used file, on the pages that use it", () => {
    const items = deriveLibrary(base).items;

    expect(items.map((item) => item.src)).toEqual([
      "photography/thumbnails/x.webp",
      "photography/published/old.jpg",
      "images/cover.webp",
      "images/a.webp",
    ]);
    expect(items[0]).toEqual({
      src: "photography/thumbnails/x.webp",
      pages: ["photography", "engineering"],
      photoFile: "x.jpg",
    });
  });

  // A pull or an outside edit must never lock the app, so repair adds what is missing.
  it("repairs a library that misses a use, a link or a stale description", () => {
    const stale = {
      schemaVersion: 1 as const,
      items: [
        { src: "images/a.webp", pages: [], alt: "stale" },
        {
          src: "photography/thumbnails/x.webp",
          pages: ["photography" as const],
          photoFile: "gone.jpg",
        },
        { src: "images/spare.webp", pages: ["archive" as const], alt: "kept" },
      ],
    };

    const repaired = repairLibrary(stale, base).items;

    expect(repaired.find((item) => item.src === "images/a.webp")).toEqual({
      src: "images/a.webp",
      pages: ["engineering"],
    });
    expect(repaired.find((item) => item.src === "photography/thumbnails/x.webp")).toMatchObject({
      pages: ["photography", "engineering"],
      photoFile: "x.jpg",
    });
    expect(repaired.find((item) => item.src === "images/spare.webp")).toEqual({
      src: "images/spare.webp",
      pages: ["archive"],
      alt: "kept",
    });
  });

  it("does not let a page that uses a file be unticked", () => {
    const withLibrary = { ...base, library: deriveLibrary(base) };

    expect(pagesInUse(withLibrary, "images/a.webp")).toEqual(["engineering"]);
    expect(setPage(withLibrary, "images/a.webp", "engineering", false)).toBe(withLibrary);
    const ticked = setPage(withLibrary, "images/a.webp", "archive", true);
    expect(ticked.library.items.find((item) => item.src === "images/a.webp")?.pages).toEqual([
      "engineering",
      "archive",
    ]);
  });

  // Photography entries need a link and a width, which a tick alone cannot supply yet.
  it("does not tick Photography", () => {
    const withLibrary = { ...base, library: deriveLibrary(base) };

    expect(setPage(withLibrary, "images/a.webp", "photography", true)).toBe(withLibrary);
  });

  it("writes a description to every use, or to the item while unused", () => {
    const withLibrary = { ...base, library: deriveLibrary(base) };

    const shared = setAlt(withLibrary, "photography/thumbnails/x.webp", "ridge");
    expect(shared.photography.photos[0].alt).toBe("ridge");
    expect(shared.engineering.projects[0].media[1].alt).toBe("ridge");
    expect(descriptionOf(shared, shared.library.items[0])).toBe("ridge");

    const coverOnly = setAlt(withLibrary, "images/cover.webp", "cover text");
    expect(coverOnly.library.items.find((item) => item.src === "images/cover.webp")?.alt).toBe(
      "cover text",
    );
  });

  it("removes only an unused item", () => {
    const withLibrary = {
      ...base,
      library: repairLibrary(
        { schemaVersion: 1, items: [{ src: "images/spare.webp", pages: [] }] },
        base,
      ),
    };

    expect(removeItem(withLibrary, "images/a.webp")).toBe(withLibrary);
    expect(
      removeItem(withLibrary, "images/spare.webp").library.items.some(
        (item) => item.src === "images/spare.webp",
      ),
    ).toBe(false);
  });

  it("names where a file is used", () => {
    expect(describeUses(base, "photography/thumbnails/x.webp", "photography")).toBe(
      "Engineering (Caltrain)",
    );
  });
});
