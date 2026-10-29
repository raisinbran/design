import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Catalogs } from "../api/api";
import { loadPortfolio, savePortfolio, TEMPORARY_SUFFIX } from "./portfolio";
import { copyRepository, hashFiles } from "./test-folder";

let folder: string;
beforeEach(() => {
  folder = copyRepository();
});
afterEach(() => rmSync(folder, { recursive: true, force: true }));

const read = (file: string) => readFileSync(path.join(folder, file), "utf8");

// The last project is collapseClipIt; the third Archive image is captioned "Deering Library".
const CLIP_IT_BODY =
  '<p class="card-text" style="hyphens:auto">\u200b<strong>The Clip-It prevents</strong> a trash bag from falling into a trash can, which dirties the can and complicates usage. It was developed using the human-centered design approach: user research testing, patent research, establishment of a white space, and an iterative design process. Prototypes were fabricated using 3D printing and fused deposition modeling.</p>';
const NEW_BODY = "<p><strong>The Clip-It</strong> keeps a trash bag from falling into the can.</p>";

describe("saving", () => {
  it("save without edits changes no files", async () => {
    const before = hashFiles(folder);
    const view = await loadPortfolio(folder);

    const saved = await savePortfolio(folder, view.revision, view.catalogs);

    expect(saved.ok).toBe(true);
    expect(hashFiles(folder)).toEqual(before);
  });

  // The first photo is DSCF3655_crop.jpg, described as "mountains".
  it.each([
    {
      name: "description",
      edit: (catalogs: Catalogs) => (catalogs.photography.photos[0].alt = "snowy mountains"),
      changes: {
        "data/media-catalog.json": ['"alt": "mountains"', '"alt": "snowy mountains"'],
        "js/photography-catalog.js": ['"alt": "mountains"', '"alt": "snowy mountains"'],
      },
    },
    {
      name: "lock",
      edit: (catalogs: Catalogs) => (catalogs.photography.photos[0].locked = true),
      changes: {
        "data/media-catalog.json": [
          '      ],\n      "thumbnail"',
          '      ],\n      "locked": true,\n      "thumbnail"',
        ],
      },
    },
    {
      name: "unlist",
      edit: (catalogs: Catalogs) => (catalogs.photography.photos[0].visible = false),
      changes: {
        "data/media-catalog.json": ['"visible": true', '"visible": false'],
        "js/photography-catalog.js": ['"visible": true', '"visible": false'],
      },
    },
    {
      name: "engineering body",
      edit: (catalogs: Catalogs) => (catalogs.engineering.projects[6].bodyHtml = NEW_BODY),
      changes: {
        "data/engineering-catalog.json": [JSON.stringify(CLIP_IT_BODY), JSON.stringify(NEW_BODY)],
        "engineeringdesign.html": [CLIP_IT_BODY, NEW_BODY],
      },
    },
    {
      name: "archive caption",
      edit: (catalogs: Catalogs) =>
        (catalogs.archive.collections[0].media[2].caption = "Deering Library, Evanston"),
      changes: {
        "data/archive-catalog.json": [
          '"caption": "Deering Library"',
          '"caption": "Deering Library, Evanston"',
        ],
        "creativedesign.html": [
          '<span class="caption-main">Deering Library</span>',
          '<span class="caption-main">Deering Library, Evanston</span>',
        ],
      },
    },
  ])("edits change only their sections: $name", async ({ edit, changes }) => {
    const before = hashFiles(folder);
    const expected = Object.fromEntries(
      Object.entries(changes).map(([file, [from, to]]) => [file, read(file).replace(from, to)]),
    );
    const view = await loadPortfolio(folder);
    edit(view.catalogs);

    const saved = await savePortfolio(folder, view.revision, view.catalogs);

    expect(saved.ok).toBe(true);
    const after = hashFiles(folder);
    const changed = Object.keys(after).filter((file) => after[file] !== before[file]);
    expect(changed.sort()).toEqual(Object.keys(changes).sort());
    for (const [file, text] of Object.entries(expected)) expect(read(file)).toBe(text);
  });

  it("sanitizer strips scripts and handlers", async () => {
    const view = await loadPortfolio(folder);
    view.catalogs.engineering.projects[6].bodyHtml =
      '<p>Clip<script>alert(1)</script><img src="x" onerror="alert(2)"><a href="javascript:alert(3)" onclick="alert(4)">It</a></p>';

    const saved = await savePortfolio(folder, view.revision, view.catalogs);

    expect(saved.ok).toBe(true);
    const page = read("engineeringdesign.html");
    expect(page).toContain('<div class="project-prose"><p>Clip<a>It</a></p></div>');
    expect(page).not.toContain("alert");
    expect(read("data/engineering-catalog.json")).not.toContain("alert");
  });

  it("save refuses files changed outside app", async () => {
    const view = await loadPortfolio(folder);
    view.catalogs.photography.photos[0].alt = "snowy mountains";
    const pulled = read("data/media-catalog.json").replace('"alt": "mountains"', '"alt": "peaks"');
    writeFileSync(path.join(folder, "data/media-catalog.json"), pulled);
    const before = hashFiles(folder);

    const saved = await savePortfolio(folder, view.revision, view.catalogs);

    expect(saved).toMatchObject({ ok: false, error: { code: "changed-outside" } });
    expect(hashFiles(folder)).toEqual(before);
  });

  it("failed save leaves files untouched", async () => {
    const view = await loadPortfolio(folder);
    view.catalogs.photography.photos[0].alt = "snowy mountains";
    // A folder in place of the last temporary file makes that write fail after the catalog's has succeeded.
    mkdirSync(path.join(folder, "js/photography-catalog.js" + TEMPORARY_SUFFIX));
    const before = hashFiles(folder);

    await expect(savePortfolio(folder, view.revision, view.catalogs)).rejects.toThrow();

    expect(hashFiles(folder)).toEqual(before);
  });
});
