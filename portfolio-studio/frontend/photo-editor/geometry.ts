// Pure geometry and history for the Photo Editor viewport: one coordinate transform shared by
// crop, level guides, grid, zoom and pan. No DOM or React here, so everything is unit-tested.
import type { Recipe } from "../../backend/api/api";

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Fractions of the (straightened, uncropped) image; the same shape as `Recipe["crop"]`. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const clampZoom = (zoom: number) => clamp(zoom, ZOOM_MIN, ZOOM_MAX);

/**
 * `zoom` is relative to fit-to-window (1 = the whole image fits). `center` is the point of the
 * image, in image fractions, that sits in the middle of the container.
 */
export interface Viewport {
  zoom: number;
  center: Point;
}

export const DEFAULT_VIEWPORT: Viewport = { zoom: 1, center: { x: 0.5, y: 0.5 } };

/** Screen pixels per image pixel. */
export function scaleOf(viewport: Viewport, container: Size, image: Size): number {
  return Math.min(container.width / image.width, container.height / image.height) * viewport.zoom;
}

export function imageToScreen(
  point: Point,
  viewport: Viewport,
  container: Size,
  image: Size,
): Point {
  const scale = scaleOf(viewport, container, image);
  return {
    x: container.width / 2 + (point.x - viewport.center.x) * image.width * scale,
    y: container.height / 2 + (point.y - viewport.center.y) * image.height * scale,
  };
}

export function screenToImage(
  point: Point,
  viewport: Viewport,
  container: Size,
  image: Size,
): Point {
  const scale = scaleOf(viewport, container, image);
  return {
    x: viewport.center.x + (point.x - container.width / 2) / (image.width * scale),
    y: viewport.center.y + (point.y - container.height / 2) / (image.height * scale),
  };
}

/** The photo can be panned until its edge reaches the middle of the window, never out of sight. */
export function clampCenter(center: Point): Point {
  return { x: clamp(center.x, 0, 1), y: clamp(center.y, 0, 1) };
}

/** Changes zoom while the image point under `anchor` (screen pixels) stays under it. */
export function zoomAt(
  viewport: Viewport,
  zoom: number,
  anchor: Point,
  container: Size,
  image: Size,
): Viewport {
  const next = clampZoom(zoom);
  const under = screenToImage(anchor, viewport, container, image);
  const zoomed: Viewport = { zoom: next, center: viewport.center };
  const scale = scaleOf(zoomed, container, image);
  return {
    zoom: next,
    center: clampCenter({
      x: under.x - (anchor.x - container.width / 2) / (image.width * scale),
      y: under.y - (anchor.y - container.height / 2) / (image.height * scale),
    }),
  };
}

/** Dragging the photo by `dx`, `dy` screen pixels moves it with the pointer. */
export function panBy(
  viewport: Viewport,
  dx: number,
  dy: number,
  container: Size,
  image: Size,
): Viewport {
  const scale = scaleOf(viewport, container, image);
  return {
    zoom: viewport.zoom,
    center: clampCenter({
      x: viewport.center.x - dx / (image.width * scale),
      y: viewport.center.y - dy / (image.height * scale),
    }),
  };
}

// ---------------------------------------------------------------- crop

const MIN_CROP_FRACTION = 0.02;

/** A rectangle dragged between two image points; `aspect` is width/height in pixels. */
export function cropFromDrag(
  start: Point,
  end: Point,
  image: Size,
  aspect?: number,
): CropRect | null {
  const from = { x: clamp(start.x, 0, 1), y: clamp(start.y, 0, 1) };
  const to = { x: clamp(end.x, 0, 1), y: clamp(end.y, 0, 1) };
  let width = Math.abs(to.x - from.x);
  let height = Math.abs(to.y - from.y);
  // A click without a drag has no size; never let it reach the aspect arithmetic (0 / 0).
  if (width === 0 && height === 0) return null;
  if (aspect) {
    // Keep the larger dragged side and derive the other, then shrink to stay inside the photo.
    const heightForWidth = (w: number) => (w * image.width) / (image.height * aspect);
    if (heightForWidth(width) >= height) height = heightForWidth(width);
    else width = (height * image.height * aspect) / image.width;
    const room = {
      x: to.x >= from.x ? 1 - from.x : from.x,
      y: to.y >= from.y ? 1 - from.y : from.y,
    };
    const shrink = Math.min(1, room.x / width, room.y / height);
    width *= shrink;
    height *= shrink;
  }
  if (!(width >= MIN_CROP_FRACTION && height >= MIN_CROP_FRACTION)) return null;
  return {
    x: to.x >= from.x ? from.x : from.x - width,
    y: to.y >= from.y ? from.y : from.y - height,
    width,
    height,
  };
}

/** Moves the crop by image-fraction deltas, keeping its exact size and staying inside the photo. */
export function moveCrop(crop: CropRect, dx: number, dy: number): CropRect {
  return {
    ...crop,
    x: clamp(crop.x + dx, 0, 1 - crop.width),
    y: clamp(crop.y + dy, 0, 1 - crop.height),
  };
}

export type CropHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** Drags `handle` to `point`; the opposite edge or corner stays fixed. */
export function resizeCrop(
  crop: CropRect,
  handle: CropHandle,
  point: Point,
  image: Size,
  aspect?: number,
): CropRect {
  const p = { x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) };
  // The moving edge stays inside the photo and at least `min` from the fixed edge. A crop already
  // smaller than the usual minimum keeps its own size as the floor, so it is never forced outward.
  const minWidth = Math.min(MIN_CROP_FRACTION, crop.width);
  const minHeight = Math.min(MIN_CROP_FRACTION, crop.height);
  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.width;
  let bottom = crop.y + crop.height;
  if (handle.includes("w")) left = clamp(p.x, 0, right - minWidth);
  if (handle.includes("e")) right = clamp(p.x, left + minWidth, 1);
  if (handle.includes("n")) top = clamp(p.y, 0, bottom - minHeight);
  if (handle.includes("s")) bottom = clamp(p.y, top + minHeight, 1);
  if (!aspect) return { x: left, y: top, width: right - left, height: bottom - top };

  const heightForWidth = (w: number) => (w * image.width) / (image.height * aspect);
  const widthForHeight = (h: number) => (h * image.height * aspect) / image.width;
  const horizontal = handle.includes("w") || handle.includes("e");
  const vertical = handle.includes("n") || handle.includes("s");
  let width = right - left;
  let height = bottom - top;
  // A single edge keeps the other axis' centre; a corner keeps the opposite corner.
  if (horizontal && !vertical) height = heightForWidth(width);
  else if (vertical && !horizontal) width = widthForHeight(height);
  else if (heightForWidth(width) >= height) height = heightForWidth(width);
  else width = widthForHeight(height);

  const fixedX = handle.includes("w") ? crop.x + crop.width : handle.includes("e") ? crop.x : null;
  const fixedY = handle.includes("n") ? crop.y + crop.height : handle.includes("s") ? crop.y : null;
  const anchorX = fixedX ?? crop.x + crop.width / 2;
  const anchorY = fixedY ?? crop.y + crop.height / 2;
  // Largest size that keeps the fixed point where it is and stays inside the photo.
  const roomX =
    fixedX === null
      ? 2 * Math.min(anchorX, 1 - anchorX)
      : handle.includes("w")
        ? anchorX
        : 1 - anchorX;
  const roomY =
    fixedY === null
      ? 2 * Math.min(anchorY, 1 - anchorY)
      : handle.includes("n")
        ? anchorY
        : 1 - anchorY;
  const shrink = Math.min(1, roomX / width, roomY / height);
  width *= shrink;
  height *= shrink;
  return {
    x: fixedX === null ? anchorX - width / 2 : handle.includes("w") ? anchorX - width : anchorX,
    y: fixedY === null ? anchorY - height / 2 : handle.includes("n") ? anchorY - height : anchorY,
    width,
    height,
  };
}

// ---------------------------------------------------------------- level guides

/** The renderer's safe-rectangle math holds up to a quarter turn of straightening. */
export const MAX_STRAIGHTEN = 90;

/** An image-fraction point in pixels of the straightened photo, the unit `levelGuide` needs. */
export const toPixels = (point: Point, image: Size): Point => ({
  x: point.x * image.width,
  y: point.y * image.height,
});

/** Folds an angle in degrees into (-90, 90], since a line has no direction. */
const foldLineAngle = (degrees: number) => {
  let folded = ((degrees % 180) + 180) % 180;
  if (folded > 90) folded -= 180;
  return folded;
};

/**
 * The new straighten value after the user draws a guide between two points of the straightened
 * photo, in pixels of that photo (convert viewport fractions with `toPixels`; fractions of a
 * non-square photo would skew the angle). A Level H guide should end up horizontal, Level V vertical. Straighten is degrees
 * clockwise, so a guide that leans clockwise needs a counter-clockwise turn. There is no minimum
 * guide length; straighten may go as far as +-90 degrees, the most the renderer supports. A guide
 * that is not drawn (same point twice) changes nothing.
 */
export function levelGuide(
  mode: "H" | "V",
  start: Point,
  end: Point,
  currentStraighten: number,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return currentStraighten;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const lean = foldLineAngle(mode === "H" ? angle : angle - 90);
  return clamp(Math.round((currentStraighten - lean) * 100) / 100, -MAX_STRAIGHTEN, MAX_STRAIGHTEN);
}

// ---------------------------------------------------------------- history

export const DEFAULT_RECIPE: Recipe = { rotation: 0, straighten: 0 };

const HISTORY_LIMIT = 100;

const sameRecipe = (a: Recipe, b: Recipe) =>
  a.rotation === b.rotation &&
  a.straighten === b.straighten &&
  a.crop?.x === b.crop?.x &&
  a.crop?.y === b.crop?.y &&
  a.crop?.width === b.crop?.width &&
  a.crop?.height === b.crop?.height;

export const isEdited = (recipe: Recipe) => !sameRecipe(recipe, DEFAULT_RECIPE);

/**
 * `revision` increases on every change, undo, redo and reset, so a preview that finishes after
 * the recipe moved on can be recognised and dropped.
 */
export interface History {
  past: Recipe[];
  present: Recipe;
  future: Recipe[];
  revision: number;
}

export const startHistory = (recipe: Recipe): History => ({
  past: [],
  present: recipe,
  future: [],
  revision: 0,
});

export const canUndo = (history: History) => history.past.length > 0;
export const canRedo = (history: History) => history.future.length > 0;

/** Applies a new recipe as one undo step; an unchanged recipe is ignored. */
export function change(history: History, recipe: Recipe): History {
  if (sameRecipe(history.present, recipe)) return history;
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: recipe,
    future: [],
    revision: history.revision + 1,
  };
}

export function undo(history: History): History {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    revision: history.revision + 1,
  };
}

export function redo(history: History): History {
  const [next, ...rest] = history.future;
  if (!next) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
    revision: history.revision + 1,
  };
}

/** Removes every edit: rotation, straightening and crop. It is one undo step, so it can be undone. */
export const reset = (history: History): History => change(history, DEFAULT_RECIPE);

// ---------------------------------------------------------------- angle

/** The one angle the user types: quarter turns plus fine straightening, in degrees clockwise. */
export const angleOf = (recipe: Recipe): number =>
  Math.round((recipe.rotation + recipe.straighten) * 100) / 100;

/**
 * Splits a typed angle (-360 to 360) into the nearest quarter turn and a remainder of at most
 * 45 degrees. A changed quarter turn drops the crop, because the safe rectangle changes shape.
 */
export function withAngle(recipe: Recipe, angle: number): Recipe {
  const clamped = clamp(angle, -360, 360);
  const quarter = Math.round(clamped / 90) * 90;
  const rotation = (((quarter % 360) + 360) % 360) as Recipe["rotation"];
  const straighten = Math.round((clamped - quarter) * 100) / 100;
  return {
    ...recipe,
    rotation,
    straighten,
    crop: rotation === recipe.rotation ? recipe.crop : undefined,
  };
}

// ---------------------------------------------------------------- zoom slider and grid

/** Slider fraction 0..1 to zoom 25%..400%, with 100% exactly in the middle. */
export const zoomFromSlider = (t: number): number => clampZoom(4 ** (2 * clamp(t, 0, 1) - 1));

export const sliderFromZoom = (zoom: number): number =>
  (Math.log(clampZoom(zoom)) / Math.log(4) + 1) / 2;

export const GRID_MODES = ["Off", "Thirds", "Center", "Golden"] as const;
export type GridMode = (typeof GRID_MODES)[number];

const GRID_LINES: Record<GridMode, number[]> = {
  Off: [],
  Thirds: [1 / 3, 2 / 3],
  Center: [0.5],
  Golden: [0.382, 0.618],
};

/** Fractions across a region, for both the vertical and the horizontal lines. */
export const gridLines = (mode: GridMode): number[] => GRID_LINES[mode];
