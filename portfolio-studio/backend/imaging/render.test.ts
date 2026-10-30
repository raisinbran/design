import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ImageSettings } from "../api/api";
import { renderJob } from "./render";

const repositoryDir = path.resolve(import.meta.dirname, "../../..");
const fontFile = path.resolve(import.meta.dirname, "../../assets/fonts/LiberationSans-Bold.ttf");
const settings: ImageSettings = {
  rights: {
    author: "Test Author",
    copyright: "Copyright (c) Test Author",
    usageTerms: "No AI training.",
  },
  watermark: { text: "Test Author", tiled: true, corner: true, strength: 0.2 },
};

const render = (file: string, recipe = { rotation: 0, straighten: 0 } as const) =>
  renderJob({ kind: "render", file, recipe, settings, fontFile });

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

describe("rendering", () => {
  // rotated.heic is stored 64 × 32 with a HEIF rotation of 90 degrees; File_000.jpeg is
  // stored 4032 × 3024 with EXIF orientation 6 (rotate 90 degrees clockwise).
  it.each([
    { name: "heic", file: path.join(import.meta.dirname, "fixtures/rotated.heic"), size: [32, 64] },
    {
      name: "rotated jpeg",
      file: path.join(repositoryDir, "images/Bolt/File_000.jpeg"),
      size: [600, 800],
    },
  ])("render outputs oriented WebP with rights ($name)", async ({ file, size }) => {
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
  });

  // 20160726_144633.jpg carries GPS, the camera's Make and Model, and XMP from Windows Photo Editor.
  it("render strips GPS and source metadata", async () => {
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
  });

  it("straightened crop has no blank corners", async () => {
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
        renderJob({ kind: "render", file: white, recipe, settings, fontFile }),
      ),
    );

    for (const output of outputs) {
      const { data, info } = await sharp(output.bytes).raw().toBuffer({ resolveWithObject: true });
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
  });
});
