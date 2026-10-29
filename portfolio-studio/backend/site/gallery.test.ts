import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const repositoryDir = path.resolve(import.meta.dirname, "../../..");
const read = (file: string) => readFileSync(path.join(repositoryDir, file), "utf8");

// Just enough DOM for js/photography.js to build its rows: elements keep their children and data attributes.
class FakeElement {
  children: FakeElement[] = [];
  dataset: Record<string, string> = {};
  style = { setProperty() {} };
  classList = { add() {} };
  clientWidth = 1136;
  setAttribute() {}
  addEventListener() {}
  appendChild(child: FakeElement) {
    this.children.push(child);
    return child;
  }
  append(...children: FakeElement[]) {
    this.children.push(...children);
  }
  replaceChildren() {
    this.children = [];
  }
}

// Calls onload right after src is set, so code that waits for images finishes before the assertions.
class FakeImage {
  onload?: () => void;
  naturalWidth = 800;
  naturalHeight = 533;
  set src(_url: string) {
    queueMicrotask(() => this.onload?.());
  }
}

/** Runs the site's photography scripts on the real catalog; the result applies a tag filter and lists the shown files. */
async function loadGallery() {
  const gallery = new FakeElement();
  const window: { PortfolioPhotographyGallery?: { setFilters(tags: string[]): void } } & Record<
    string,
    unknown
  > = { addEventListener() {} };
  const document = {
    getElementById: (id: string) => (id === "photo-gallery" ? gallery : null),
    createElement: () => new FakeElement(),
    querySelector: () => null,
  };
  const context = vm.createContext({ window, document, Image: FakeImage });
  for (const file of ["js/photography-catalog.js", "js/photography.js"]) {
    vm.runInContext(read(file), context);
  }
  await new Promise((resolve) => setTimeout(resolve));
  return (tags: string[]) => {
    window.PortfolioPhotographyGallery!.setFilters(tags);
    return gallery.children.flatMap((row) => row.children.map((tile) => tile.dataset.file));
  };
}

describe("photography page", () => {
  it.each([
    { name: "no filter", tags: [] },
    { name: "Night filter", tags: ["Night"] },
  ])("gallery shows catalog order: $name", async ({ tags }) => {
    const { photos } = JSON.parse(read("data/media-catalog.json")) as {
      photos: { file: string; visible: boolean; tags: string[] }[];
    };
    const expected = photos
      .filter((photo) => photo.visible && tags.every((tag) => photo.tags.includes(tag)))
      .map((photo) => photo.file);
    const showGallery = await loadGallery();

    const shown = showGallery(tags);

    expect(shown).toEqual(expected);
  });
});
