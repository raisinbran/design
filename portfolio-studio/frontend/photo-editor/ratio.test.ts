import { describe, expect, it } from "vitest";
import {
  aspectOf,
  choosePreset,
  cropWithAspect,
  editProportion,
  FREEFORM,
  PRESETS,
  setOrientation,
} from "./ratio";

const image = { width: 3000, height: 2000 };

describe("ratio", () => {
  it("offers the ten Apple Photos choices", () => {
    expect(PRESETS).toEqual([
      "Original",
      "Freeform",
      "Square",
      "16:9",
      "4:5",
      "5:7",
      "4:3",
      "3:5",
      "3:2",
      "Custom",
    ]);
  });

  it("shows 3:2 as 3 by 2 and swaps once for portrait", () => {
    const landscape = choosePreset(FREEFORM, "3:2", image);
    expect([landscape.width, landscape.height]).toEqual([3, 2]);
    const portrait = setOrientation(landscape, "portrait");
    expect([portrait.preset, portrait.width, portrait.height]).toEqual(["3:2", 2, 3]);
    expect(setOrientation(portrait, "portrait")).toBe(portrait);
    expect(aspectOf(portrait)).toBeCloseTo(2 / 3);
  });

  it("applies the chosen orientation to the next preset", () => {
    const portrait = setOrientation(choosePreset(FREEFORM, "Square", image), "portrait");
    const next = choosePreset(portrait, "16:9", image);
    expect([next.width, next.height]).toEqual([9, 16]);
  });

  it("derives Original from the photo, Square as 1 by 1, and leaves Freeform blank", () => {
    const original = choosePreset(FREEFORM, "Original", { width: 2000, height: 3000 });
    expect([original.width, original.height, original.orientation]).toEqual([
      2000,
      3000,
      "portrait",
    ]);
    expect([
      choosePreset(FREEFORM, "Square", image).width,
      choosePreset(FREEFORM, "Square", image).height,
    ]).toEqual([1, 1]);
    const free = choosePreset(original, "Freeform", image);
    expect([free.width, free.height, aspectOf(free)]).toEqual([null, null, undefined]);
  });

  it("switches to Custom when a proportion is typed and ignores invalid input", () => {
    const preset = choosePreset(FREEFORM, "3:2", image);
    const custom = editProportion(preset, "width", 7);
    expect([custom.preset, custom.width, custom.height]).toEqual(["Custom", 7, 2]);
    for (const bad of [0, -1, Number.NaN, Infinity, ""])
      expect(editProportion(preset, "width", bad)).toBe(preset);
    expect(editProportion(FREEFORM, "width", 4)).toBe(FREEFORM);
  });

  it("keeps the crop centre and stays inside the photo", () => {
    const crop = { x: 0.3, y: 0.3, width: 0.4, height: 0.4 };
    const next = cropWithAspect(crop, 1, { width: 1000, height: 1000 });
    expect(next.x + next.width / 2).toBeCloseTo(0.5);
    expect(next.y + next.height / 2).toBeCloseTo(0.5);
    expect(next.width / next.height).toBeCloseTo(1);
    const edge = cropWithAspect({ x: 0, y: 0, width: 0.2, height: 0.2 }, 3, {
      width: 1000,
      height: 1000,
    });
    expect(edge.x).toBeGreaterThanOrEqual(0);
    expect(edge.y).toBeGreaterThanOrEqual(0);
    expect(edge.x + edge.width).toBeLessThanOrEqual(1);
    expect((edge.width * 1000) / (edge.height * 1000)).toBeCloseTo(3);
  });

  it("fills the photo when there is no crop", () => {
    const full = cropWithAspect(undefined, 1.5, { width: 1000, height: 1000 });
    expect(full.width).toBeCloseTo(1);
    expect(full.height).toBeCloseTo(2 / 3);
    expect(full.y).toBeCloseTo(1 / 6);
  });
});
