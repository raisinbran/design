import type { Photo, WorkspaceCatalogs } from "../models";
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}
export function beginHistory<T>(value: T): History<T> {
  return { past: [], present: value, future: [] };
}
export function changeHistory<T>(history: History<T>, present: T): History<T> {
  return {
    past: [...history.past.slice(-79), history.present],
    present,
    future: [],
  };
}
export function undoHistory<T>(history: History<T>): History<T> {
  if (!history.past.length) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past.at(-1)!,
    future: [history.present, ...history.future],
  };
}
export function redoHistory<T>(history: History<T>): History<T> {
  if (!history.future.length) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
  };
}
/** Locked photographs keep their absolute slots for every arrangement operation. */
export function movePhoto(
  photos: Photo[],
  from: number,
  to: number,
  locks: ReadonlySet<string>,
): Photo[] {
  if (
    from < 0 ||
    to < 0 ||
    from >= photos.length ||
    to >= photos.length ||
    locks.has(photos[from].file) ||
    locks.has(photos[to].file)
  )
    return photos;
  const result = [...photos];
  [result[from], result[to]] = [result[to], result[from]];
  return result;
}
export function suggestArrangement(
  photos: Photo[],
  locks: ReadonlySet<string>,
): Photo[] {
  // Group related tags, then alternate portrait/landscape where possible without moving locked slots.
  const pool = photos
    .filter((photo) => !locks.has(photo.file))
    .sort(
      (a, b) =>
        (a.tags[0] || "").localeCompare(b.tags[0] || "") ||
        a.file.localeCompare(b.file),
    );
  let previousPortrait = false;
  return photos.map((photo) => {
    if (locks.has(photo.file)) {
      previousPortrait = photo.aspectRatio < 1;
      return photo;
    }
    const match = pool.findIndex(
      (candidate) => candidate.aspectRatio < 1 !== previousPortrait,
    );
    const next = pool.splice(match < 0 ? 0 : match, 1)[0];
    previousPortrait = next.aspectRatio < 1;
    return next;
  });
}
export function isDirty(
  original: WorkspaceCatalogs,
  current: WorkspaceCatalogs,
): boolean {
  return JSON.stringify(original) !== JSON.stringify(current);
}
export function defaultRecipe(): import("../models").EditRecipe {
  return {
    version: 1,
    rotation: 0,
    straighten: 0,
    maxSide: 800,
    format: "webp",
    quality: 78,
    watermark: {
      tiled: true,
      corner: true,
      strength: 0.16,
      text: "Brandon J. Chen",
    },
    rights: {
      author: "Brandon J. Chen",
      copyright: "Copyright (c) Brandon J. Chen",
      usageNotice:
        "AI/ML training, generative AI training, model fine-tuning, dataset creation, and automated style imitation are not authorized. Contact Brandon J. Chen for permission.",
    },
  };
}
