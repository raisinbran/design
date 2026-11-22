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

function page(
  width: number,
  count: number,
  dimensions: Array<[number, number]> = [],
  viewportHeight = 750,
) {
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
    innerHeight: viewportHeight,
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

function rowUsedWidth(row: SiteElement): number {
  const gap = Number.parseFloat(row.style.gap);
  const tilesWidth = row.children.reduce(
    (total, tile) => total + Number.parseFloat(tile.style.width),
    0,
  );
  return tilesWidth + gap * (row.children.length - 1);
}

function expectInteriorRowsFullWidth(gallery: SiteElement, width: number): void {
  const interiorRows = gallery.children.slice(0, -2);
  expect(interiorRows.length).toBeGreaterThan(0);
  for (const row of interiorRows) {
    expect(row.children.length).toBeGreaterThanOrEqual(1);
    expect(row.children.length).toBeLessThanOrEqual(2);
    expect(rowUsedWidth(row)).toBeCloseTo(width, 5);
  }
}

describe("Photography gallery row capacity", () => {
  it.each([390, 720])(
    "fills mobile rows before the last two, whether they hold one or two photos at %i px",
    (width) => {
      const dimensions: Array<[number, number]> = [
        [900, 600],
        [750, 1000],
        [600, 900],
        [500, 900],
        [900, 600],
        [400, 900],
      ];
      const { gallery } = page(width, dimensions.length, dimensions);
      expect(rowFiles(gallery)).toEqual([
        ["IMG_0.jpg"],
        ["IMG_1.jpg"],
        ["IMG_2.jpg", "IMG_3.jpg"],
        ["IMG_4.jpg"],
        ["IMG_5.jpg"],
      ]);
      expectInteriorRowsFullWidth(gallery, width);
      // A very tall photo in the last two rows may remain narrower.
      expect(rowUsedWidth(gallery.children.at(-1)!)).toBeLessThan(width);
    },
  );

  it("recomputes full-width mobile rows after filtering and clearing tags", () => {
    const dimensions: Array<[number, number]> = [
      [500, 900],
      [1200, 800],
      [400, 900],
      [800, 600],
      [900, 600],
      [900, 600],
      [500, 900],
      [700, 900],
      [400, 800],
      [900, 600],
    ];
    const { gallery, window } = page(390, dimensions.length, dimensions);
    expectInteriorRowsFullWidth(gallery, 390);

    window.PortfolioPhotographyGallery!.setFilters(["Day"]);
    expect(rowFiles(gallery)).toEqual([
      ["IMG_0.jpg", "IMG_2.jpg"],
      ["IMG_4.jpg"],
      ["IMG_6.jpg", "IMG_8.jpg"],
    ]);
    expectInteriorRowsFullWidth(gallery, 390);

    window.PortfolioPhotographyGallery!.setFilters([]);
    expect(rowFiles(gallery).flat()).toEqual(
      Array.from({ length: dimensions.length }, (_, index) => `IMG_${index}.jpg`),
    );
    expectInteriorRowsFullWidth(gallery, 390);
  });

  it.each([
    { width: 900, height: 420 },
    { width: 1440, height: 750 },
  ])("justifies desktop/tablet interior rows at $width x $height", ({ width, height }) => {
    const { gallery, window } = page(width, 15, [], height);
    expectInteriorRowsFullWidth(gallery, width);
    window.PortfolioPhotographyGallery!.setFilters(["Day"]);
    expectInteriorRowsFullWidth(gallery, width);
  });


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
