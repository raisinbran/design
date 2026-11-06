import { describe, expect, it } from "vitest";
import type { Catalogs } from "../../backend/api/api";
import { movePhoto, suggestArrangement } from "./arrangement";

type Photo = Catalogs["photography"]["photos"][number];

const WIDE = { thumbnailWidth: 800, thumbnailHeight: 533 };
const TALL = { thumbnailWidth: 450, thumbnailHeight: 800 };

const photo = (file: string, tags: string[], size: typeof WIDE, locked?: true): Photo => ({
  file,
  alt: file,
  visible: true,
  displayPriority: "normal",
  tags,
  ...(locked && { locked }),
  ...size,
});

const night = photo("night", ["Night"], WIDE);
const day = photo("day", ["Day"], WIDE);
const dayWide = photo("dayWide", ["Day"], WIDE);
const dayTall = photo("dayTall", ["Day"], TALL);
const pinned = photo("pinned", ["Day"], WIDE, true);
const dusk = photo("dusk", ["Dusk"], WIDE);
const untagged = photo("untagged", [], WIDE);

describe("arrangement", () => {
  it.each([
    {
      name: "drag down past a lock",
      arrange: () => movePhoto([night, day, pinned, dusk], 0, 3),
      expected: ["day", "dusk", "pinned", "night"],
    },
    {
      name: "drag up past a lock",
      arrange: () => movePhoto([night, day, pinned, dusk], 3, 0),
      expected: ["dusk", "night", "pinned", "day"],
    },
    {
      name: "Suggest Arrangement alternates shapes by tag",
      arrange: () =>
        suggestArrangement(
          [night, pinned, untagged, day, dusk, dayWide, dayTall],
          ["Day", "Dusk", "Night"],
        ),
      expected: ["day", "pinned", "dayTall", "dayWide", "dusk", "night", "untagged"],
    },
  ])("arrangement keeps locked photos in place: $name", ({ arrange, expected }) => {
    const arranged = arrange();

    expect(arranged.map((item) => item.file)).toEqual(expected);
  });
});
