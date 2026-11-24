// The crop's aspect ratio: ten Apple Photos choices, shown as Width and Height in either orientation.
import { clamp, type CropRect, type Size } from "./geometry";

export const PRESETS = [
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
] as const;
export type Preset = (typeof PRESETS)[number];
export type Orientation = "landscape" | "portrait";

/** Landscape width and height of each fixed preset; portrait swaps them. */
const SHAPES: Partial<Record<Preset, [number, number]>> = {
  Square: [1, 1],
  "16:9": [16, 9],
  "4:5": [5, 4],
  "5:7": [7, 5],
  "4:3": [4, 3],
  "3:5": [5, 3],
  "3:2": [3, 2],
};

/** `width` and `height` are the displayed proportions; Freeform leaves them null. */
export interface RatioState {
  preset: Preset;
  orientation: Orientation;
  width: number | null;
  height: number | null;
}

export const FREEFORM: RatioState = {
  preset: "Freeform",
  orientation: "landscape",
  width: null,
  height: null,
};

const valid = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value > 0;

const oriented = (a: number, b: number, orientation: Orientation): [number, number] =>
  orientation === "landscape" ? [Math.max(a, b), Math.min(a, b)] : [Math.min(a, b), Math.max(a, b)];

export function choosePreset(state: RatioState, preset: Preset, image: Size): RatioState {
  if (preset === "Freeform") return { ...FREEFORM, orientation: state.orientation };
  if (preset === "Custom") return { ...state, preset };
  if (preset === "Original") {
    const orientation = image.width >= image.height ? "landscape" : "portrait";
    return { preset, orientation, width: image.width, height: image.height };
  }
  const [a, b] = SHAPES[preset]!;
  const [width, height] = oriented(a, b, state.orientation);
  return { preset, orientation: state.orientation, width, height };
}

/** Swaps the proportions once; the preset stays selected. */
export function setOrientation(state: RatioState, orientation: Orientation): RatioState {
  if (orientation === state.orientation) return state;
  return { ...state, orientation, width: state.height, height: state.width };
}

/** Typing a proportion switches to Custom; a value that is not positive and finite is ignored. */
export function editProportion(
  state: RatioState,
  side: "width" | "height",
  value: number | string,
): RatioState {
  const number = typeof value === "number" ? value : Number.NaN;
  if (!valid(number) || state.preset === "Freeform") return state;
  const next = { ...state, preset: "Custom" as const, [side]: number };
  if (valid(next.width) && valid(next.height))
    next.orientation = next.width >= next.height ? "landscape" : "portrait";
  return next;
}

/** Width over height in pixels, or undefined when the crop is free. */
export const aspectOf = (state: RatioState): number | undefined =>
  state.preset !== "Freeform" && valid(state.width) && valid(state.height)
    ? state.width / state.height
    : undefined;

/**
 * A crop of the given shape around the current crop's centre, with the same area where the photo
 * allows; with no crop it is the largest centred crop of that shape.
 */
export function cropWithAspect(crop: CropRect | undefined, aspect: number, image: Size): CropRect {
  const shape = aspect * (image.height / image.width);
  const area = crop ? crop.width * crop.height : shape;
  let width = Math.sqrt(area * shape);
  let height = width / shape;
  const centre = crop
    ? { x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 }
    : { x: 0.5, y: 0.5 };
  const fit = Math.min(
    1,
    (2 * Math.min(centre.x, 1 - centre.x)) / width,
    (2 * Math.min(centre.y, 1 - centre.y)) / height,
  );
  width *= fit;
  height *= fit;
  return {
    x: clamp(centre.x - width / 2, 0, 1 - width),
    y: clamp(centre.y - height / 2, 0, 1 - height),
    width,
    height,
  };
}
