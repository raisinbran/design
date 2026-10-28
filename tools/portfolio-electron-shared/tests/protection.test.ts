import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { defaultRecipe } from "../src/renderer/editor-state";
import { renderImage } from "../src/processing/render-image";
import { DATA_MINING_NOTICE, escapeXml } from "../src/processing/protection";

/** Read TIFF entries independently of the writer, including the EXIF sub-IFD. */
function exifFields(bytes: Buffer): Map<number, Buffer> {
  const tiff = bytes.subarray(
    bytes.subarray(0, 6).toString() === "Exif\0\0" ? 6 : 0,
  );
  const little = tiff.subarray(0, 2).toString() === "II";
  const u16 = (offset: number) =>
    little ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);
  const u32 = (offset: number) =>
    little ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset);
  const fields = new Map<number, Buffer>();
  const visit = (offset: number) => {
    for (let index = 0, count = u16(offset); index < count; index++) {
      const at = offset + 2 + index * 12;
      const tag = u16(at);
      const type = u16(at + 2);
      const count = u32(at + 4);
      const length =
        count *
        ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] || 1);
      const start = length > 4 ? u32(at + 8) : at + 8;
      fields.set(tag, tiff.subarray(start, start + length));
      if (tag === 34665) visit(u32(at + 8));
    }
  };
  visit(u32(4));
  return fields;
}
const xmlValue = (xml: string, tag: string) =>
  xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1];

test("every Published Image format embeds fresh EXIF authorship and standard rights/PLUS XMP without private metadata", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "processor-rights-"));
  try {
    const filename = path.join(directory, "private-original.jpg");
    const original = await sharp({
      create: { width: 300, height: 200, channels: 3, background: "white" },
    })
      .withExif({
        IFD0: {
          Artist: "PRIVATE-CAMERA-OWNER",
          DateTime: "2001:02:03 04:05:06",
          ImageDescription: "/private/source/path",
        },
        IFD2: { DateTimeOriginal: "2001:02:03 04:05:06" },
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: "37/1 46/1 30/1",
          GPSLongitudeRef: "W",
          GPSLongitude: "122/1 25/1 0/1",
        },
      })
      .withXmp(
        '<x:xmpmeta xmlns:x="adobe:ns:meta/">PRIVATE-XMP-SOURCE</x:xmpmeta>',
      )
      .jpeg()
      .toBuffer();
    await writeFile(filename, original);
    assert.ok(
      exifFields((await sharp(original).metadata()).exif!).has(34853),
      "fixture must actually contain a GPS IFD",
    );
    for (const format of ["webp", "jpeg", "png"] as const) {
      const recipe = defaultRecipe();
      recipe.format = format;
      recipe.rights.author = 'Author <A> & "B"';
      const image = await renderImage(filename, recipe);
      const bytes = Buffer.from(image.bytes);
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.format, format);
      assert.ok(metadata.exif);
      assert.ok(metadata.xmp);
      const fields = exifFields(metadata.exif);
      assert.equal(
        fields.get(315)?.toString().replace(/\0$/, ""),
        recipe.rights.author,
      );
      assert.equal(
        fields.get(40093)?.toString("utf16le").replace(/\0$/, ""),
        recipe.rights.author,
      );
      assert.equal(
        fields.get(33432)?.toString().replace(/\0$/, ""),
        recipe.rights.copyright,
      );
      assert.equal(
        fields.get(37510)?.subarray(8).toString().replace(/\0$/, ""),
        recipe.rights.usageNotice,
      );
      assert.equal(fields.has(34853), false, "GPS IFD must be absent");
      assert.equal(fields.has(306), false, "source DateTime must be absent");
      assert.equal(
        fields.has(36867),
        false,
        "source DateTimeOriginal must be absent",
      );
      const xmp = metadata.xmp.toString();
      assert.ok(
        xmlValue(xmp, "dc:creator")?.includes(escapeXml(recipe.rights.author)),
      );
      assert.ok(
        xmlValue(xmp, "dc:rights")?.includes(
          escapeXml(recipe.rights.copyright),
        ),
      );
      assert.ok(
        xmlValue(xmp, "xmpRights:UsageTerms")?.includes(
          escapeXml(recipe.rights.usageNotice),
        ),
      );
      assert.ok(
        xmp.includes(`plus:DataMining rdf:resource="${DATA_MINING_NOTICE}"`),
      );
      for (const secret of [
        "PRIVATE-CAMERA-OWNER",
        "2001:02:03",
        "/private/source/path",
        "PRIVATE-XMP-SOURCE",
      ])
        assert.equal(bytes.includes(Buffer.from(secret)), false);
    }
    assert.deepEqual(await readFile(filename), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("tiled and corner settings each affect final pixels; reprocessing is deterministic and shared strength scales both", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "processor-watermarks-"),
  );
  try {
    const filename = path.join(directory, "original.png");
    await sharp({
      create: { width: 800, height: 534, channels: 3, background: "#303030" },
    })
      .png()
      .toFile(filename);
    const original = await readFile(filename);
    const recipe = defaultRecipe();
    recipe.format = "png";
    const protectedImage = await renderImage(filename, recipe);
    assert.deepEqual(
      (await renderImage(filename, recipe)).bytes,
      protectedImage.bytes,
    );
    const cleanRecipe = structuredClone(recipe);
    cleanRecipe.watermark.tiled = false;
    cleanRecipe.watermark.corner = false;
    const clean = await renderImage(filename, cleanRecipe);
    const cleanPixels = await sharp(clean.bytes).raw().toBuffer();
    const delta = async (bytes: Uint8Array) => {
      const pixels = await sharp(bytes).raw().toBuffer();
      return pixels.reduce(
        (sum, value, at) => sum + Math.abs(value - cleanPixels[at]),
        0,
      );
    };
    for (const kind of ["tiled", "corner"] as const) {
      const single = structuredClone(cleanRecipe);
      single.watermark[kind] = true;
      const normal = await renderImage(filename, single);
      const weaker = structuredClone(single);
      weaker.watermark.strength /= 2;
      assert.ok(
        (await delta(normal.bytes)) >
          (await delta((await renderImage(filename, weaker)).bytes)),
      );
      assert.ok((await delta(normal.bytes)) > 0);
    }
    assert.deepEqual(await readFile(filename), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
