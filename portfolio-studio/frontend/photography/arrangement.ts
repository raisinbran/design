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
