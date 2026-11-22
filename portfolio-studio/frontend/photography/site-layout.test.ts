import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

interface SiteElement {
  children: SiteElement[];
  style: Record<string, string>;
  dataset: Record<string, string>;
  className: string;
  classList: { add: (name: string) => void };
  appendChild: (child: SiteElement) => void;
  replaceChildren: () => void;
  clientWidth?: number;
}

const galleryScript = readFileSync(
  path.resolve(import.meta.dirname, "../../../js/photography.js"),
  "utf8",
);

function page(width: number, count: number, dimensions: Array<[number, number]> = []) {
  const gallery = makeElement();
  gallery.clientWidth = width;
  const photos = Array.from({ length: count }, (_, index) => ({
    file: `IMG_${index}.jpg`,
    alt: `Photo ${index}`,
    visible: true,
    thumbnailWidth: dimensions[index]?.[0] ?? (index % 3 === 0 ? 450 : 800),
    thumbnailHeight: dimensions[index]?.[1] ?? (index % 3 === 0 ? 800 : 533),
    tags: [index % 2 === 0 ? "Day" : "Dusk"],
  }));
  const window = {
    PORTFOLIO_PHOTOS: photos,
    innerWidth: width,
    innerHeight: 750,
    addEventListener: () => undefined,
  };
  const document = {
    getElementById: (id: string) => (id === "photo-gallery" ? gallery : null),
    createElement: () => makeElement(),
  };
  vm.runInNewContext(galleryScript, { window, document });
  return {
    gallery,
    window: window as typeof window & {
      PortfolioPhotographyGallery?: { setFilters: (tags: string[]) => void };
    },
  };
}

function makeElement(): SiteElement {
  const names: string[] = [];
  const node: SiteElement = {
    children: [],
    style: {},
    dataset: {},
    className: "",
    classList: {
      add(name) {
        names.push(name);
      },
    },
    appendChild(child) {
      this.children.push(child);
    },
    replaceChildren() {
      this.children = [];
    },
  };
  return node;
}

function rowFiles(gallery: SiteElement): string[][] {
  return gallery.children.map((row) => row.children.map((tile) => tile.dataset.file));
}

describe("Photography gallery row capacity", () => {
  it.each([390, 720])(
    "keeps ordinary mobile photos solo and pairs only adjacent 3:2-tall portraits at %i px",
    (width) => {
      const dimensions: Array<[number, number]> = [
        [900, 600], // Landscape: one photo per row.
        [750, 1000], // Ordinary portrait: one photo per row.
        [600, 900], // Exactly 3:2 tall: pair eligible.
        [500, 900], // Taller portrait: pair eligible.
        [800, 800], // Square: one photo per row.
        [500, 750], // Unpaired tall portrait: one photo per row.
        [720, 1000], // Ordinary portrait cannot join the preceding tall photo.
      ];
      const { gallery } = page(width, dimensions.length, dimensions);
      expect(rowFiles(gallery)).toEqual([
        ["IMG_0.jpg"],
        ["IMG_1.jpg"],
        ["IMG_2.jpg", "IMG_3.jpg"],
        ["IMG_4.jpg"],
        ["IMG_5.jpg"],
        ["IMG_6.jpg"],
      ]);
    },
  );

  it("preserves catalog order and reflows tall pairs after mobile filtering", () => {
    const dimensions: Array<[number, number]> = [
      [600, 900],
      [900, 600],
      [500, 900],
      [500, 800],
      [800, 600],
    ];
    const { gallery, window } = page(390, dimensions.length, dimensions);
    expect(rowFiles(gallery)).toEqual([
      ["IMG_0.jpg"],
      ["IMG_1.jpg"],
      ["IMG_2.jpg", "IMG_3.jpg"],
      ["IMG_4.jpg"],
    ]);

    window.PortfolioPhotographyGallery!.setFilters(["Day"]);
    expect(rowFiles(gallery)).toEqual([["IMG_0.jpg", "IMG_2.jpg"], ["IMG_4.jpg"]]);
    window.PortfolioPhotographyGallery!.setFilters([]);
    expect(rowFiles(gallery)).toEqual([
      ["IMG_0.jpg"],
      ["IMG_1.jpg"],
      ["IMG_2.jpg", "IMG_3.jpg"],
      ["IMG_4.jpg"],
    ]);
  });

  it.each([380, 720, 900, 1440, 1900])(
    "uses no more than two photographs per row at %i px",
    (width) => {
      const { gallery } = page(width, 13);
      expect(gallery.children.length).toBeGreaterThan(0);
      expect(gallery.children.flatMap((row) => row.children)).toHaveLength(13);
      expect(
        gallery.children.every((row) => row.children.length >= 1 && row.children.length <= 2),
      ).toBe(true);
    },
  );

  it("keeps the maximum after applying and clearing filters", () => {
    const { gallery, window } = page(1440, 15);
    window.PortfolioPhotographyGallery!.setFilters(["Day"]);
    expect(gallery.children.flatMap((row) => row.children)).toHaveLength(8);
    expect(gallery.children.every((row) => row.children.length <= 2)).toBe(true);
    window.PortfolioPhotographyGallery!.setFilters([]);
    expect(gallery.children.flatMap((row) => row.children)).toHaveLength(15);
    expect(gallery.children.every((row) => row.children.length <= 2)).toBe(true);
  });
});
