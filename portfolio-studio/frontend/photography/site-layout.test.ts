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

function page(width: number, count: number) {
  const gallery = makeElement();
  gallery.clientWidth = width;
  const photos = Array.from({ length: count }, (_, index) => ({
    file: `IMG_${index}.jpg`,
    alt: `Photo ${index}`,
    visible: true,
    thumbnailWidth: index % 3 === 0 ? 450 : 800,
    thumbnailHeight: index % 3 === 0 ? 800 : 533,
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
  return { gallery, window: window as typeof window & { PortfolioPhotographyGallery?: { setFilters: (tags: string[]) => void } } };
}

function makeElement(): SiteElement {
  const names: string[] = [];
  const node: SiteElement = {
    children: [],
    style: {},
    dataset: {},
    className: "",
    classList: { add(name) { names.push(name); } },
    appendChild(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
  };
  return node;
}

describe("Photography gallery row capacity", () => {
  it.each([380, 720, 900, 1440, 1900])(
    "uses no more than two photographs per row at %i px",
    (width) => {
      const { gallery } = page(width, 13);
      expect(gallery.children.length).toBeGreaterThan(0);
      expect(gallery.children.flatMap((row) => row.children)).toHaveLength(13);
      expect(gallery.children.every((row) => row.children.length >= 1 && row.children.length <= 2)).toBe(true);
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
