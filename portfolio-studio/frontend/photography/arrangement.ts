import type { Catalogs } from "../../backend/api/api";

type Photo = Catalogs["photography"]["photos"][number];

// Locked photos keep their indexes, and `unlocked` fills the other indexes in its order.
function pinLocked(photos: Photo[], unlocked: Photo[]): Photo[] {
  let next = 0;
  return photos.map((photo) => (photo.locked ? photo : unlocked[next++]));
}

/** Moves the photo at `from` to index `to`, as a drag does; locked photos keep their indexes and never move. */
export function movePhoto(photos: Photo[], from: number, to: number): Photo[] {
  const moved = photos[from];
  if (moved.locked || from === to) return photos;
  const others = (list: Photo[]) => list.filter((photo) => !photo.locked && photo !== moved);
  const unlocked = others(photos);
  unlocked.splice(others(photos.slice(0, to > from ? to + 1 : to)).length, 0, moved);
  return pinLocked(photos, unlocked);
}

// The site's portrait test in js/photography.js; a square, or a photo with neither a size nor an aspect ratio, counts as landscape.
const isPortrait = (photo: Photo) =>
  (photo.thumbnailWidth && photo.thumbnailHeight
    ? photo.thumbnailWidth / photo.thumbnailHeight
    : (photo.aspectRatio ?? 1.5)) < 0.95;

// Keeps the group's order, except that each next photo is the first one whose orientation differs from the last.
function alternateShapes(group: Photo[]): Photo[] {
  const rest = [...group];
  const result: Photo[] = [];
  while (rest.length) {
    const last = result.at(-1);
    const index = last ? rest.findIndex((photo) => isPortrait(photo) !== isPortrait(last)) : 0;
    result.push(...rest.splice(Math.max(index, 0), 1));
  }
  return result;
}

/** Groups the unlocked photos by first tag in `photoTags` order, untagged last, and alternates portrait and landscape within each group. */
export function suggestArrangement(photos: Photo[], photoTags: string[]): Photo[] {
  const rank = (photo: Photo) => {
    const index = photoTags.indexOf(photo.tags[0]);
    return index < 0 ? photoTags.length : index;
  };
  const unlocked = photos.filter((photo) => !photo.locked);
  const ranks = [...new Set(unlocked.map(rank))].sort((a, b) => a - b);
  return pinLocked(
    photos,
    ranks.flatMap((group) => alternateShapes(unlocked.filter((photo) => rank(photo) === group))),
  );
}

export type ArrangementStrategy = "balanced" | "color" | "themes" | "contrast";
export type AppearanceMap = Record<
  string,
  { rgb: [number, number, number]; brightness: number; saturation: number }
>;

const WEIGHTS: Record<ArrangementStrategy, [number, number, number, number, number]> = {
  balanced: [0.38, 0.2, 0.14, 0.16, 0.12],
  color: [0.64, 0.22, 0.06, 0.04, 0.04],
  themes: [0.14, 0.12, 0.08, 0.6, 0.06],
  contrast: [0.48, 0.22, 0.12, 0.1, 0.08],
};

function visualDistance(
  first: Photo,
  second: Photo,
  appearances: AppearanceMap,
  strategy: ArrangementStrategy,
): number {
  const a = appearances[first.file];
  const b = appearances[second.file];
  const color = Math.hypot(...a.rgb.map((value, index) => value - b.rgb[index])) / 441.67;
  const brightness = Math.abs(a.brightness - b.brightness) / 255;
  const saturation = Math.abs(a.saturation - b.saturation);
  const firstTags = new Set(first.tags);
  const secondTags = new Set(second.tags);
  const shared = [...firstTags].filter((tag) => secondTags.has(tag)).length;
  const theme = 1 - shared / Math.max(1, new Set([...firstTags, ...secondTags]).size);
  const ratio = (photo: Photo) =>
    photo.thumbnailWidth && photo.thumbnailHeight
      ? photo.thumbnailWidth / photo.thumbnailHeight
      : (photo.aspectRatio ?? 1.5);
  const shape = Math.min(
    1,
    Math.abs(Math.log(Math.max(0.1, ratio(first)) / Math.max(0.1, ratio(second)))) / 2,
  );
  const weights = WEIGHTS[strategy];
  const total = [color, brightness, saturation, theme, shape].reduce(
    (sum, component, index) => sum + component * weights[index],
    0,
  );
  return strategy === "contrast" ? -total : total;
}

/** Orders photos using the four visual strategies of the former Python arranger. */
export function arrangePhotos(
  photos: Photo[],
  strategy: ArrangementStrategy,
  appearances: AppearanceMap,
  reverse = false,
): Photo[] {
  const missing = photos.filter((photo) => !appearances[photo.file]);
  if (missing.length)
    throw new Error(
      `Cannot analyze the image for: ${missing.map((photo) => photo.file).join(", ")}`,
    );
  const pool = photos.filter((photo) => !photo.locked);
  const arranged: Photo[] = [];
  for (const photo of photos) {
    if (photo.locked) {
      arranged.push(photo);
      continue;
    }
    if (!arranged.length) {
      arranged.push(pool.shift()!);
      continue;
    }
    const last = arranged[arranged.length - 1];
    const distances = pool.map((item) => visualDistance(last, item, appearances, strategy));
    const closest = distances.indexOf(Math.min(...distances));
    arranged.push(pool.splice(closest, 1)[0]);
  }
  if (!reverse) return arranged;
  return pinLocked(arranged, arranged.filter((photo) => !photo.locked).reverse());
}

/** Reverses only unlocked entries, leaving the owner's locked positions intact. */
export function reverseUnlocked(photos: Photo[]): Photo[] {
  return pinLocked(photos, photos.filter((photo) => !photo.locked).reverse());
}
