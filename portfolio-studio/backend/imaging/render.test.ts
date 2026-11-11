import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp, { type Sharp } from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ImageSettings } from "../api/api";
import { FONT_FAMILY, renderJob, SITE_LOGO, type Rendered } from "./render";

const repositoryDir = path.resolve(import.meta.dirname, "../../..");
const fontFile = path.resolve(import.meta.dirname, "../../assets/fonts/LiberationSans-Bold.ttf");
const settings: ImageSettings = {
  rights: {
    author: "Test Author",
    copyright: "Copyright (c) Test Author",
    usageTerms: "No AI training.",
  },
  watermark: { text: "Test Author", corner: true },
};

// The first renders on GitHub's Windows and macOS runners take longer than Vitest's 5 s default.
const RENDER_TIMEOUT_MS = 30_000;

const render = (file: string, recipe = { rotation: 0, straighten: 0 } as const) =>
  renderJob({ kind: "render", file, recipe, settings, fontFile, siteFolder: repositoryDir });

// Lists the tag ids of the first EXIF directory, which holds Make, Model and the GPS pointer.
function exifTags(exif: Buffer): number[] {
  const tiff = exif.subarray(
    exif.indexOf("II*\0") >= 0 ? exif.indexOf("II*\0") : exif.indexOf("MM\0*"),
  );
  const little = tiff.toString("latin1", 0, 2) === "II";
  const u16 = (at: number) => (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
  const u32 = (at: number) => (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at));
  const directory = u32(4);
  return Array.from({ length: u16(directory) }, (_, index) => u16(directory + 2 + index * 12));
}

let scratch: string;
beforeAll(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), "portfolio-studio-render-"));
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** A 2000 × 1500 image of one gray `level`, which renders at 800 × 600. */
async function flatImage(level: number): Promise<string> {
  const file = path.join(scratch, `flat-${level}.png`);
  const background = { r: level, g: level, b: level };
  await sharp({ create: { width: 2000, height: 1500, channels: 3, background } })
    .png()
    .toFile(file);
  return file;
}

/** The box around pixels more than 4 levels from `level`, their mean and largest difference. */
async function findMark(output: Rendered, level: number) {
  const { data, info } = await sharp(output.bytes).raw().toBuffer({ resolveWithObject: true });
  const box = { left: info.width, top: info.height, right: 0, bottom: 0 };
  let [sum, count, peak] = [0, 0, 0];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const value = data[(y * info.width + x) * info.channels];
      if (Math.abs(value - level) <= 4) continue;
      [box.left, box.top] = [Math.min(box.left, x), Math.min(box.top, y)];
      [box.right, box.bottom] = [Math.max(box.right, x + 1), Math.max(box.bottom, y + 1)];
      [sum, count, peak] = [sum + value, count + 1, Math.max(peak, Math.abs(value - level))];
    }
  }
  return { ...box, imageWidth: info.width, imageHeight: info.height, mean: sum / count, peak };
}

/** Renders a flat gray image with a one-letter watermark, so the logo is most of the mark. */
const renderFlat = async (level: number) =>
  renderJob({
    kind: "render",
    file: await flatImage(level),
    recipe: { rotation: 0, straighten: 0 },
    settings: { ...settings, watermark: { text: "I", corner: true } },
    fontFile,
    siteFolder: repositoryDir,
  });

/** The first channel of `image`, cropped to its ink, one byte per pixel. */
async function inkOf(image: Sharp) {
  const { data, info } = await image
    .trim({ background: "#000000", threshold: 0 })
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * The best correlation, from -1 to 1, between `expected` and the output's distance from `level`,
 * with `expected`'s bottom left corner within 3 px of `left` and `bottom`.
 */
async function matchInk(
  output: Rendered,
  level: number,
  expected: { data: Buffer; width: number; height: number },
  left: number,
  bottom: number,
) {
  const { data, info } = await sharp(output.bytes).raw().toBuffer({ resolveWithObject: true });
  const pixels = expected.width * expected.height;
  let best = -1;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      let [sumA, sumB, sumAB, sumAA, sumBB] = [0, 0, 0, 0, 0];
      for (let y = 0; y < expected.height; y++) {
        for (let x = 0; x < expected.width; x++) {
          const row = bottom - expected.height + y + dy;
          const at = (row * info.width + left + x + dx) * info.channels;
          const a = Math.abs(data[at] - level);
          const b = expected.data[y * expected.width + x];
          [sumA, sumB, sumAB] = [sumA + a, sumB + b, sumAB + a * b];
          [sumAA, sumBB] = [sumAA + a * a, sumBB + b * b];
        }
      }
      const covariance = sumAB - (sumA * sumB) / pixels;
      const spread = Math.sqrt((sumAA - sumA ** 2 / pixels) * (sumBB - sumB ** 2 / pixels));
      best = Math.max(best, covariance / spread);
    }
  }
  return best;
}

describe("renderJob", () => {
  // rotated.heic is stored 64 × 32 with a HEIF rotation of 90 degrees; File_000.jpeg is
  // stored 4032 × 3024 with EXIF orientation 6 (rotate 90 degrees clockwise).
  it.each([
    { name: "heic", file: path.join(import.meta.dirname, "fixtures/rotated.heic"), size: [32, 64] },
    {
      name: "rotated jpeg",
      file: path.join(repositoryDir, "images/Bolt/File_000.jpeg"),
      size: [600, 800],
    },
  ])(
    "returns an upright WebP with rights ($name)",
    async ({ file, size }) => {
      const output = await render(file);

      const metadata = await sharp(output.bytes).metadata();
      expect(metadata.format).toBe("webp");
      expect([metadata.width, metadata.height]).toEqual(size);
      expect(metadata.exif!.toString("latin1")).toContain("Test Author");
      expect(metadata.exif!.toString("latin1")).toContain("Copyright (c) Test Author");
      const xmp = metadata.xmp!.toString("utf8");
      expect(xmp).toContain("<rdf:li>Test Author</rdf:li>");
      expect(xmp).toContain("No AI training.");
      expect(xmp).toContain("http://ns.useplus.org/ldf/vocab/DMI-PROHIBITED-AIMLTRAINING");
    },
    RENDER_TIMEOUT_MS,
  );

  // 20160726_144633.jpg carries GPS, the camera's Make and Model, and XMP from Windows Photo Editor.
  it(
    "strips GPS and source metadata",
    async () => {
      const output = await render(path.join(repositoryDir, "images/Bolt/20160726_144633.jpg"));

      const metadata = await sharp(output.bytes).metadata();
      const tags = exifTags(metadata.exif!);
      expect(tags).not.toContain(0x8825); // GPS
      expect(tags).not.toContain(0x010f); // Make
      expect(tags).not.toContain(0x0110); // Model
      expect(metadata.exif!.toString("latin1")).not.toContain("samsung");
      expect(metadata.xmp!.toString("utf8")).not.toContain("Windows Photo Editor");
      expect(metadata.icc).toBeUndefined();
      expect(metadata.iptc).toBeUndefined();
    },
    RENDER_TIMEOUT_MS,
  );

  // Straightening must never leave a black corner, which would show on the gallery image.
  it(
    "leaves no blank corners after straightening",
    async () => {
      const white = path.join(scratch, "white.png");
      await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#ffffff" } })
        .png()
        .toFile(white);
      const recipes = [
        // Without the 1 px margin, this angle leaves a dark top left corner.
        { rotation: 90, straighten: 2.8 },
        // The bottom right quarter of the safe rectangle, after a quarter turn.
        { rotation: 90, straighten: -7, crop: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 } },
      ] as const;

      const outputs = await Promise.all(
        recipes.map((recipe) =>
          renderJob({
            kind: "render",
            file: white,
            recipe,
            settings,
            fontFile,
            siteFolder: repositoryDir,
          }),
        ),
      );

      for (const output of outputs) {
        const { data, info } = await sharp(output.bytes)
          .raw()
          .toBuffer({ resolveWithObject: true });
        const corners = [
          [0, 0],
          [info.width - 1, 0],
          [0, info.height - 1],
          [info.width - 1, info.height - 1],
        ];
        // The rotation fills blank corners with black; the white original stays near white.
        const darkest = corners.map(([x, y]) =>
          Math.min(...data.subarray((y * info.width + x) * info.channels).subarray(0, 3)),
        );
        expect(darkest.every((value) => value > 200)).toBe(true);
      }
    },
    RENDER_TIMEOUT_MS,
  );
});

describe("watermark", () => {
  // At 800 × 600 the text is 16 px (2.6% of 600) and the margin 14 px (2.4%), as on the site's
  // other images. A mark in the wrong place or size, without the logo, or tiled, would differ.
  it(
    "sits bottom right with the logo first",
    async () => {
      const mark = await findMark(await renderFlat(48), 48);

      expect(Math.abs(mark.imageWidth - mark.right - 14)).toBeLessThanOrEqual(2);
      expect(Math.abs(mark.imageHeight - mark.bottom - 14)).toBeLessThanOrEqual(2);
      const height = mark.bottom - mark.top;
      expect(height).toBeGreaterThanOrEqual(9);
      expect(height).toBeLessThanOrEqual(14);
      // The logo, about as wide as the letter is high, and a gap come before the narrow "I".
      expect(mark.right - mark.left).toBeGreaterThan(1.5 * height);
      // Tiled text would change pixels across the whole image.
      expect(mark.left).toBeGreaterThan(0.9 * mark.imageWidth);
      expect(mark.top).toBeGreaterThan(0.9 * mark.imageHeight);
    },
    RENDER_TIMEOUT_MS,
  );

  // The mark stays faint but readable on any background, lighter on dark and darker on light, at
  // 20% to 55% opacity of a tone about 60 levels away. The upper bound allows for WebP ringing at
  // the mark's edges.
  it.each([
    { name: "dark", level: 48, lighter: true },
    { name: "light", level: 208, lighter: false },
  ])(
    "contrasts in tone with the background ($name)",
    async ({ level, lighter }) => {
      const mark = await findMark(await renderFlat(level), level);

      expect(mark.mean > level).toBe(lighter);
      expect(mark.peak).toBeGreaterThanOrEqual(10);
      expect(mark.peak).toBeLessThanOrEqual(30);
    },
    RENDER_TIMEOUT_MS,
  );

  // A mark whose pixels are copied with the wrong row length shows streaks where the letters
  // and the grape should be, yet keeps the right size, place and tone.
  it(
    "keeps the shapes of letters and logo",
    async () => {
      const output = await render(await flatImage(48));
      const mark = await findMark(output, 48);
      const font = `${FONT_FAMILY} 16`;
      const letters = await inkOf(
        sharp({ text: { text: "Test Author", font, fontfile: fontFile } }),
      );
      const grape = await inkOf(sharp(path.join(repositoryDir, SITE_LOGO)).extractChannel(3));
      const logo = await inkOf(
        sharp(grape.data, {
          raw: { width: grape.width, height: grape.height, channels: 1 },
        }).resize({
          height: letters.height,
        }),
      );

      const lettersLeft = mark.right - letters.width;
      expect(await matchInk(output, 48, letters, lettersLeft, mark.bottom)).toBeGreaterThan(0.7);
      expect(await matchInk(output, 48, logo, mark.left, mark.bottom)).toBeGreaterThan(0.7);
    },
    RENDER_TIMEOUT_MS,
  );
});
