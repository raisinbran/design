import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIN_CONFIDENCE } from "./autolevel";
import { levelJob } from "./render";

let folder = "";
beforeAll(async () => {
  folder = await mkdtemp(path.join(os.tmpdir(), "level-"));
});
afterAll(() => rm(folder, { recursive: true, force: true }));

describe("levelJob", () => {
  it("measures a photo whose lines lean 4 degrees clockwise", async () => {
    const size = 400;
    const raw = Buffer.alloc(size * size * 3);
    const radians = (4 * Math.PI) / 180;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const across = -x * Math.sin(radians) + y * Math.cos(radians);
        raw.fill(
          Math.round(128 + 100 * Math.sin((across * 2 * Math.PI) / 30)),
          (y * size + x) * 3,
          (y * size + x) * 3 + 3,
        );
      }
    const file = path.join(folder, "tilted.png");
    await sharp(raw, { raw: { width: size, height: size, channels: 3 } })
      .png()
      .toFile(file);
    const { tilt } = await levelJob({
      kind: "level",
      file,
      orientation: { rotation: 0, straighten: 0 },
    });
    expect(tilt?.degrees).toBeCloseTo(4, 0);
    expect(tilt!.confidence).toBeGreaterThan(MIN_CONFIDENCE);
  });
});
