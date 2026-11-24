import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  change,
  clampCenter,
  clampZoom,
  cropFromDrag,
  DEFAULT_RECIPE,
  DEFAULT_VIEWPORT,
  imageToScreen,
  isEdited,
  levelGuide,
  moveCrop,
  panBy,
  redo,
  reset,
  resizeCrop,
  scaleOf,
  screenToImage,
  startHistory,
  undo,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomAt,
  type Viewport,
} from "./geometry";

const container = { width: 800, height: 600 };
const image = { width: 2000, height: 1000 };
const near = (actual: number, expected: number, digits = 6) =>
  expect(actual).toBeCloseTo(expected, digits);
const nearRect = (
  actual: { x: number; y: number; width: number; height: number } | null,
  expected: { x: number; y: number; width: number; height: number },
) => {
  expect(actual).not.toBeNull();
  for (const key of ["x", "y", "width", "height"] as const) near(actual![key], expected[key]);
};

describe("viewport transform", () => {
  it("fits the whole image at zoom 1, centered", () => {
    near(scaleOf(DEFAULT_VIEWPORT, container, image), 0.4);
    const topLeft = imageToScreen({ x: 0, y: 0 }, DEFAULT_VIEWPORT, container, image);
    near(topLeft.x, 0);
    near(topLeft.y, 100);
  });

  it("round-trips screen and image points at any zoom and center", () => {
    const viewport: Viewport = { zoom: 2.5, center: { x: 0.3, y: 0.7 } };
    const point = { x: 0.42, y: 0.58 };
    const back = screenToImage(
      imageToScreen(point, viewport, container, image),
      viewport,
      container,
      image,
    );
    near(back.x, point.x);
    near(back.y, point.y);
  });

  it("clamps zoom to 25-400%", () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(1.5)).toBe(1.5);
  });

  it("keeps the image point under the cursor fixed while zooming", () => {
    const anchor = { x: 600, y: 200 };
    const before = screenToImage(anchor, DEFAULT_VIEWPORT, container, image);
    const zoomed = zoomAt(DEFAULT_VIEWPORT, 3, anchor, container, image);
    const after = screenToImage(anchor, zoomed, container, image);
    near(after.x, before.x);
    near(after.y, before.y);
    expect(zoomed.zoom).toBe(3);
  });

  it("pans with the pointer and never loses the photo", () => {
    const viewport: Viewport = { zoom: 2, center: { x: 0.5, y: 0.5 } };
    const panned = panBy(viewport, 100, 0, container, image);
    expect(panned.center.x).toBeLessThan(0.5);
    const far = panBy(viewport, -1e9, 1e9, container, image);
    expect(far.center).toEqual({ x: 1, y: 0 });
    expect(clampCenter({ x: -3, y: 4 })).toEqual({ x: 0, y: 1 });
  });
});

describe("crop", () => {
  it("builds a free crop from a drag in any direction", () => {
    const crop = cropFromDrag({ x: 0.6, y: 0.7 }, { x: 0.2, y: 0.3 }, image);
    nearRect(crop, { x: 0.2, y: 0.3, width: 0.4, height: 0.4 });
  });

  it("clamps a drag that leaves the photo and ignores a tiny one", () => {
    const crop = cropFromDrag({ x: 0.5, y: 0.5 }, { x: 2, y: 2 }, image);
    nearRect(crop, { x: 0.5, y: 0.5, width: 0.5, height: 0.5 });
    expect(cropFromDrag({ x: 0.5, y: 0.5 }, { x: 0.505, y: 0.505 }, image)).toBeNull();
  });

  it("honours a pixel aspect ratio in image fractions", () => {
    const crop = cropFromDrag({ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.2 }, image, 1)!;
    // 2000x1000 image: a 1:1 crop needs height fraction = 2 x width fraction.
    near((crop.width * image.width) / (crop.height * image.height), 1);
    expect(crop.y + crop.height).toBeLessThanOrEqual(1);
  });

  it("shrinks an aspect crop that would leave the photo", () => {
    const crop = cropFromDrag({ x: 0.1, y: 0.6 }, { x: 0.9, y: 0.7 }, image, 1)!;
    near((crop.width * image.width) / (crop.height * image.height), 1);
    expect(crop.y + crop.height).toBeLessThanOrEqual(1 + 1e-9);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("moves a crop without changing its size or leaving the photo", () => {
    const crop = { x: 0.2, y: 0.2, width: 0.3, height: 0.3 };
    nearRect(moveCrop(crop, 0.1, -0.1), { x: 0.3, y: 0.1, width: 0.3, height: 0.3 });
    nearRect(moveCrop(crop, 5, 5), { x: 0.7, y: 0.7, width: 0.3, height: 0.3 });
    nearRect(moveCrop(crop, -5, -5), { x: 0, y: 0, width: 0.3, height: 0.3 });
  });

  it("resizes from a handle with the opposite side fixed", () => {
    const crop = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };
    const east = resizeCrop(crop, "e", { x: 0.8, y: 0.9 }, image);
    nearRect(east, { x: 0.2, y: 0.2, width: 0.6, height: 0.4 });
    const northWest = resizeCrop(crop, "nw", { x: 0.1, y: 0.05 }, image);
    near(northWest.x, 0.1);
    near(northWest.y, 0.05);
    near(northWest.x + northWest.width, 0.6);
    near(northWest.y + northWest.height, 0.6);
  });

  it("does not let a handle cross the opposite side", () => {
    const crop = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };
    const squeezed = resizeCrop(crop, "e", { x: 0.1, y: 0.4 }, image);
    expect(squeezed.width).toBeGreaterThan(0);
    expect(squeezed.x).toBe(0.2);
  });

  it("keeps the aspect ratio when resizing a corner", () => {
    const crop = { x: 0.2, y: 0.2, width: 0.2, height: 0.4 }; // 1:1 on a 2000x1000 image
    const resized = resizeCrop(crop, "se", { x: 0.7, y: 0.5 }, image, 1);
    near((resized.width * image.width) / (resized.height * image.height), 1);
    near(resized.x, 0.2);
    near(resized.y, 0.2);
  });
});

describe("level guides", () => {
  const level = (mode: "H" | "V", dx: number, dy: number, current = 0) =>
    levelGuide(mode, { x: 100, y: 100 }, { x: 100 + dx, y: 100 + dy }, current);

  it("levels a horizontal guide that leans clockwise by turning counter-clockwise", () => {
    const result = level("H", 1000, 100); // leans about 5.71 degrees clockwise (y grows downward)
    expect(result).toEqual({ ok: true, straighten: -5.71 });
  });

  it("levels a guide that leans counter-clockwise by turning clockwise", () => {
    expect(level("H", 1000, -100)).toEqual({ ok: true, straighten: 5.71 });
  });

  it("treats a guide drawn right-to-left the same", () => {
    expect(level("H", -1000, -100)).toEqual({ ok: true, straighten: -5.71 });
  });

  it("levels a vertical guide", () => {
    // Bottom to the right of the top: the photo leans counter-clockwise, so turn clockwise.
    expect(level("V", 100, 1000)).toEqual({ ok: true, straighten: 5.71 });
    expect(level("V", -100, 1000)).toEqual({ ok: true, straighten: -5.71 });
    expect(level("V", 100, -1000)).toEqual({ ok: true, straighten: -5.71 });
  });

  it("adds to the straightening already applied", () => {
    expect(level("H", 1000, 100, 10)).toEqual({ ok: true, straighten: 4.29 });
  });

  it("changes nothing for an already level guide", () => {
    expect(level("H", 500, 0, 3)).toEqual({ ok: true, straighten: 3 });
    expect(level("V", 0, 500, -2)).toEqual({ ok: true, straighten: -2 });
  });

  it("rejects a guide shorter than 20 source pixels", () => {
    const result = level("H", 10, 5);
    expect(result.ok).toBe(false);
  });

  it("rejects a result beyond the correction limit", () => {
    expect(level("H", 100, 100).ok).toBe(false); // 45 degrees
    expect(level("H", 1000, 100, -30).ok).toBe(false); // -35.71 cumulative
    expect(level("H", 1000, 100, -29).ok).toBe(true); // -34.71 cumulative
  });
});

describe("history", () => {
  const turned = { ...DEFAULT_RECIPE, rotation: 90 as const };
  const cropped = { ...turned, crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } };

  it("starts unedited with nothing to undo or redo", () => {
    const history = startHistory(DEFAULT_RECIPE);
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
    expect(isEdited(history.present)).toBe(false);
  });

  it("undoes and redoes each change", () => {
    let history = startHistory(DEFAULT_RECIPE);
    history = change(change(history, turned), cropped);
    expect(undo(history).present).toBe(turned);
    expect(undo(undo(history)).present).toBe(DEFAULT_RECIPE);
    expect(redo(undo(history)).present).toBe(cropped);
    expect(undo(undo(undo(history))).present).toBe(DEFAULT_RECIPE);
  });

  it("clears redo when a new change follows an undo", () => {
    let history = change(change(startHistory(DEFAULT_RECIPE), turned), cropped);
    history = change(undo(history), { ...turned, straighten: 3 });
    expect(canRedo(history)).toBe(false);
  });

  it("ignores a change that equals the current recipe", () => {
    const history = change(startHistory(DEFAULT_RECIPE), turned);
    expect(change(history, { ...turned })).toBe(history);
  });

  it("resets every edit in one undoable step", () => {
    const history = change(change(startHistory(DEFAULT_RECIPE), turned), cropped);
    const cleared = reset(history);
    expect(cleared.present).toEqual(DEFAULT_RECIPE);
    expect(isEdited(cleared.present)).toBe(false);
    expect(undo(cleared).present).toBe(cropped);
    expect(reset(cleared)).toBe(cleared);
  });

  it("resets a photo that was saved with edits", () => {
    const saved = startHistory(cropped);
    expect(reset(saved).present).toEqual(DEFAULT_RECIPE);
  });

  it("bumps the revision on every step so a stale preview can be dropped", () => {
    const first = change(startHistory(DEFAULT_RECIPE), turned);
    const second = undo(first);
    const third = redo(second);
    expect([first.revision, second.revision, third.revision]).toEqual([1, 2, 3]);
  });

  it("keeps at most 100 undo steps", () => {
    let history = startHistory(DEFAULT_RECIPE);
    for (let step = 1; step <= 150; step++)
      history = change(history, { ...DEFAULT_RECIPE, straighten: step / 10 });
    expect(history.past).toHaveLength(100);
  });
});
