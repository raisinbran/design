import { describe, expect, it } from "vitest";
import type { Catalogs } from "../../backend/api/api";
import { arrangePhotos, movePhoto, reverseUnlocked, suggestArrangement } from "./arrangement";
import type { AppearanceMap } from "./arrangement";

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
  // Locked photos must stay at their indexes through drags and Suggest Arrangement, or the owner's
  // chosen places would move.
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
  ])("keeps locked photos in place ($name)", ({ arrange, expected }) => {
    const arranged = arrange();

    expect(arranged.map((item) => item.file)).toEqual(expected);
  });
});

const appearances: AppearanceMap = {
  red: { rgb: [220, 50, 40], brightness: 103, saturation: 0.71 },
  warm: { rgb: [200, 60, 50], brightness: 103, saturation: 0.59 },
  blue: { rgb: [40, 80, 220], brightness: 113, saturation: 0.71 },
  pinned: { rgb: [100, 100, 100], brightness: 100, saturation: 0 },
};

describe("visual arrangement", () => {
  const red = photo("red", ["Day"], WIDE);
  const blue = photo("blue", ["Night"], WIDE);
  const warm = photo("warm", ["Day"], TALL);

  it("sorts by measured colors and can reverse the proposed order", () => {
    const ordered = arrangePhotos([red, blue, warm], "color", appearances);
    expect(ordered.map((item) => item.file)).toEqual(["red", "warm", "blue"]);
    const reversed = arrangePhotos([red, blue, warm], "color", appearances, true);
    expect(reversed.map((item) => item.file)).toEqual(["blue", "warm", "red"]);
  });

  it("keeps locked indexes when reversing", () => {
    const arranged = reverseUnlocked([red, pinned, blue, warm]);
    expect(arranged.map((item) => item.file)).toEqual(["warm", "pinned", "blue", "red"]);
  });
});
