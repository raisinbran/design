import { describe, expect, it } from "vitest";
import { estimateTilt, MIN_CONFIDENCE } from "./autolevel";

const SIZE = 200;

/** Soft stripes (as a blurred photo edge) whose lines lean `degrees` clockwise on screen (y grows downward). */
function stripes(degrees: number): Uint8Array {
  const gray = new Uint8Array(SIZE * SIZE);
  const radians = (degrees * Math.PI) / 180;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const across = -x * Math.sin(radians) + y * Math.cos(radians);
      gray[y * SIZE + x] = Math.round(128 + 100 * Math.sin((across * 2 * Math.PI) / 24));
    }
  return gray;
}

describe("estimateTilt", () => {
  it.each([0, 3, -5, 20, -30])("measures a lean of %d degrees", (degrees) => {
    const tilt = estimateTilt(stripes(degrees), SIZE, SIZE)!;
    expect(tilt.degrees).toBeCloseTo(degrees, 0);
    expect(tilt.confidence).toBeGreaterThan(MIN_CONFIDENCE);
  });

  it("treats vertical lines like horizontal ones", () => {
    expect(estimateTilt(stripes(93), SIZE, SIZE)!.degrees).toBeCloseTo(3, 0);
  });

  it("has low confidence for noise", () => {
    let seed = 7;
    const noise = new Uint8Array(SIZE * SIZE).map(() => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed >>> 24;
    });
    const tilt = estimateTilt(noise, SIZE, SIZE);
    expect(!tilt || tilt.confidence < MIN_CONFIDENCE).toBe(true);
  });

  it("finds nothing in a flat image", () => {
    expect(estimateTilt(new Uint8Array(SIZE * SIZE).fill(90), SIZE, SIZE)).toBeNull();
  });
});
