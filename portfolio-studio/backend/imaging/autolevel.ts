// Finds how far a photo's dominant straight lines lean from horizontal or vertical.

/** Share of edge strength that must agree on one lean before Auto-level acts; chosen by testing. */
export const MIN_CONFIDENCE = 0.2;
const MIN_EDGE_PIXELS = 200;
const BINS_PER_DEGREE = 2;
const BIN_COUNT = 90 * BINS_PER_DEGREE;

export interface Tilt {
  /** Degrees clockwise that the dominant lines lean, from -45 to 45. */
  degrees: number;
  /** 0 to 1: the share of edge strength within 2 degrees of that lean. */
  confidence: number;
}

/** Edge directions of a grayscale image vote, weighted by strength, for a lean modulo 90 degrees. */
export function estimateTilt(gray: Uint8Array, width: number, height: number): Tilt | null {
  const votes = new Float64Array(BIN_COUNT);
  const edges: { fold: number; weight: number }[] = [];
  let total = 0;
  const at = (x: number, y: number) => gray[y * width + x];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const gx =
        at(x + 1, y - 1) +
        2 * at(x + 1, y) +
        at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const gy =
        at(x - 1, y + 1) +
        2 * at(x, y + 1) +
        at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      const weight = Math.hypot(gx, gy);
      if (weight === 0) continue;
      // A line leans the same way as its gradient, modulo a quarter turn.
      const degrees = (Math.atan2(gy, gx) * 180) / Math.PI;
      let fold = ((degrees % 90) + 90) % 90;
      if (fold > 45) fold -= 90;
      edges.push({ fold, weight });
      total += weight;
    }
  }
  if (!edges.length) return null;
  const cutoff = total / (width * height);
  let strong = 0;
  let strength = 0;
  for (const { fold, weight } of edges) {
    if (weight < cutoff) continue;
    strong++;
    strength += weight;
    votes[Math.floor((fold + 45) * BINS_PER_DEGREE) % BIN_COUNT] += weight;
  }
  if (strong < MIN_EDGE_PIXELS) return null;

  // The window of ±2 degrees with the most strength; bins wrap, since 45 and -45 are the same lean.
  const radius = 2 * BINS_PER_DEGREE;
  let best = 0;
  let bestMass = -1;
  for (let center = 0; center < BIN_COUNT; center++) {
    let mass = 0;
    for (let offset = -radius; offset <= radius; offset++)
      mass += votes[(center + offset + BIN_COUNT) % BIN_COUNT];
    if (mass > bestMass) {
      bestMass = mass;
      best = center;
    }
  }
  let weighted = 0;
  for (let offset = -radius; offset <= radius; offset++)
    weighted += offset * votes[(best + offset + BIN_COUNT) % BIN_COUNT];
  const center = best + weighted / bestMass;
  const degrees = (center + 0.5) / BINS_PER_DEGREE - 45;
  return {
    degrees: Math.round((((degrees + 45 + 90) % 90) - 45) * 100) / 100,
    confidence: bestMass / strength,
  };
}
