// Finds how far a photo's dominant straight lines lean from horizontal or vertical, with a Hough
// transform over its strongest edges: long straight edges pile up in one bin, texture does not.

/** The tilt peak must be this many times the typical line evidence; set from tests on real photos. */
export const MIN_CONFIDENCE = 1.5;
const EDGE_SHARE = 0.08;
const STEP = 0.5;

export interface Tilt {
  /** Degrees clockwise that the dominant lines lean, from -45 to 45. */
  degrees: number;
  /** The peak's line evidence over the median across all angles; about 1 means no clear lines. */
  confidence: number;
}

export function estimateTilt(gray: Uint8Array, width: number, height: number): Tilt | null {
  const strength = new Float32Array(width * height);
  const sorted: number[] = [];
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
      const magnitude = Math.hypot(gx, gy);
      strength[y * width + x] = magnitude;
      if (magnitude > 0) sorted.push(magnitude);
    }
  }
  if (sorted.length < 100) return null;
  sorted.sort((a, b) => a - b);
  const cutoff = sorted[Math.floor(sorted.length * (1 - EDGE_SHARE))];
  const points: [number, number][] = [];
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++)
      if (strength[y * width + x] >= cutoff) points.push([x - width / 2, y - height / 2]);

  // Each angle scores the sum of squared bin counts of its parallel lines, once for near-horizontal
  // lines and once for near-vertical ones, so a single long line counts far more than scattered edges.
  const angles = Math.round(90 / STEP);
  const diagonal = Math.ceil(Math.hypot(width, height));
  const bins = new Int32Array(2 * diagonal + 3);
  const evidence = new Float64Array(angles);
  for (let i = 0; i < angles; i++) {
    const phi = ((-45 + i * STEP) * Math.PI) / 180;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    let total = 0;
    for (const vertical of [false, true]) {
      bins.fill(0);
      for (const [x, y] of points) {
        const offset = vertical ? x * cos + y * sin : -x * sin + y * cos;
        bins[Math.round(offset) + diagonal + 1]++;
      }
      for (const count of bins) total += count * count;
    }
    evidence[i] = total;
  }
  let best = 0;
  for (let i = 1; i < angles; i++) if (evidence[i] > evidence[best]) best = i;
  // A parabola through the peak and its neighbours refines the angle below the step size.
  const before = evidence[(best - 1 + angles) % angles];
  const after = evidence[(best + 1) % angles];
  const bend = before - 2 * evidence[best] + after;
  const shift = bend === 0 ? 0 : (0.5 * (before - after)) / bend;
  const median = [...evidence].sort((a, b) => a - b)[angles >> 1];
  if (!(median > 0)) return null;
  let degrees = -45 + (best + shift) * STEP;
  if (degrees >= 45) degrees -= 90;
  return { degrees: Math.round(degrees * 100) / 100, confidence: evidence[best] / median };
}
