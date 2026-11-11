import { access, readFile } from "node:fs/promises";
import path from "node:path";
import decodeHeic from "heic-decode";
import sharp, { type OutputInfo, type OverlayOptions, type Sharp } from "sharp";
import type { ImageSettings, Orientation, Recipe } from "../api/api";

export const OUTPUT_LONG_SIDE = 800;
export const PROXY_LONG_SIDE = 1600;
export const WEBP_QUALITY = 78;
export const PIXEL_LIMIT = 100_000_000;
export const FONT_FAMILY = "Liberation Sans Bold";
/** The grape logo, relative to the website folder; the mark uses only its alpha channel. */
export const SITE_LOGO = "assets/homepage-2026/grape-hover.png";
// The background under the mark scales this to between about 20% and 55%.
const MARK_OPACITY = 92 / 255;
// toneMark's tuning. Each value came over unexplained from the old apps.
const MAX_MARK_OPACITY = 0.55;
// The opacity scale runs from DARK_OPACITY_SCALE on black to 1 at MID_GRAY and above.
const DARK_OPACITY_SCALE = 0.55;
const BRIGHTNESS_OPACITY_SCALE = 0.45;
const MID_GRAY = 128;
const DARK_BUSY_LIMIT = 140;
const DARK_BUSY_BOOST = 1.2;
const BUSY_BOOST = 0.4;
const FULL_DETAIL_SPREAD = 64;
const FULL_BUSY_TEXTURE = 12;
const BASE_TONE_OFFSET = 60;
const DETAIL_TONE_OFFSET = 20;
const DARK_BUSY_TONE_OFFSET = 20;
const BUSY_TONE_OFFSET = 10;
// Blur radii as fractions of the mark's size and of its height.
const TEXTURE_BLUR_DIVISOR = 6;
const TONE_BLUR_DIVISOR = 12;

export type Job =
  | { kind: "proxy"; file: string; orientation: Orientation }
  | {
      kind: "render";
      file: string;
      recipe: Recipe;
      settings: ImageSettings;
      fontFile: string;
      /** The website folder, which holds the logo. */
      siteFolder: string;
    };

export interface Rendered {
  bytes: Uint8Array;
  width: number;
  height: number;
}

// HEIF files start with an "ftyp" box; AVIF shares the container, and sharp decodes it itself.
function isHeic(bytes: Buffer): boolean {
  const header = bytes.subarray(0, 64).toString("latin1");
  return (
    header.slice(4, 8) === "ftyp" && !/avif|avis/.test(header) && /hei[cxms]|hev[cx]/.test(header)
  );
}

async function decode(file: string): Promise<{ image: Sharp; width: number; height: number }> {
  const bytes = await readFile(file);
  if (!isHeic(bytes)) {
    const image = sharp(bytes, { limitInputPixels: PIXEL_LIMIT }).autoOrient();
    const { autoOrient } = await image.metadata();
    return { image, ...autoOrient };
  }
  // libheif applies the HEIF rotation and mirroring while decoding.
  const { width, height, data } = await decodeHeic({ buffer: bytes });
  if (width * height > PIXEL_LIMIT) throw new Error("The original is over 100 megapixels");
  const image = sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
    raw: { width, height, channels: 4 },
  });
  return { image, width, height };
}

/**
 * Returns the largest rectangle with the image's own aspect ratio that fits inside the image after
 * rotating it by `degrees`, so a crop inside it never shows the blank corners that rotating adds.
 */
export function safeRectangle(width: number, height: number, degrees: number) {
  const angle = (Math.abs(degrees) * Math.PI) / 180;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const scale = Math.min(
    width / (width * cos + height * sin),
    height / (width * sin + height * cos),
  );
  return { width: width * scale, height: height * scale };
}

/** Rotates the original and cuts out the crop, measured inside the safe rectangle, as raw pixels. */
async function straightenAndCrop(file: string, recipe: Recipe, longSide: number) {
  const decoded = await decode(file);
  const turned =
    recipe.rotation % 180 ? [decoded.height, decoded.width] : [decoded.width, decoded.height];
  const rotated = await decoded.image
    .removeAlpha()
    .rotate(recipe.rotation + recipe.straighten, { background: "#000000" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const safe = safeRectangle(turned[0], turned[1], recipe.straighten);
  // Rotation blends the edge pixels with the background, so a straightened crop stays 1 px further in.
  const margin = recipe.straighten ? 1 : 0;
  const crop = recipe.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const left = (rotated.info.width - safe.width) / 2 + margin + crop.x * (safe.width - 2 * margin);
  const top =
    (rotated.info.height - safe.height) / 2 + margin + crop.y * (safe.height - 2 * margin);
  const right = left + crop.width * (safe.width - 2 * margin);
  const bottom = top + crop.height * (safe.height - 2 * margin);
  const region = {
    left: Math.ceil(left),
    top: Math.ceil(top),
    width: Math.max(1, Math.floor(right) - Math.ceil(left)),
    height: Math.max(1, Math.floor(bottom) - Math.ceil(top)),
  };
  return sharp(rotated.data, { raw: rotated.info })
    .extract(region)
    .resize(longSide, longSide, { fit: "inside", withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
}

const escapeXml = (text: string) =>
  text.replace(
    /[<>&"']/g,
    (character) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]!,
  );

interface RawImage {
  data: Buffer;
  info: OutputInfo;
}

/**
 * One byte per pixel, 0 where nothing is drawn. sharp writes a one-channel raw input back out as
 * RGB, so each step that makes a mask ends with `extractChannel(0)`.
 */
interface Mask {
  data: Buffer;
  width: number;
  height: number;
}

/** Crops a one-channel image to its pixels above zero. */
async function cropToInk(image: Sharp): Promise<Mask> {
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  let [left, top, right, bottom] = [info.width, info.height, -1, -1];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (!data[y * info.width + x]) continue;
      [left, right] = [Math.min(left, x), Math.max(right, x)];
      [top, bottom] = [Math.min(top, y), Math.max(bottom, y)];
    }
  }
  if (right < 0) throw new Error("The watermark has no visible pixels");
  const width = right - left + 1;
  const height = bottom - top + 1;
  const cropped = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .extract({ left, top, width, height })
    .extractChannel(0)
    .raw()
    .toBuffer();
  return { data: cropped, width, height };
}

/** The text in the bundled font, cropped to its ink, so its height is the letters' height. */
async function drawText(text: string, size: number, fontFile: string): Promise<Mask> {
  // Pango draws a system font, with no error, when the font file is missing.
  await access(fontFile).catch((error: unknown) => {
    throw new Error(`The watermark font is missing: ${fontFile}`, { cause: error });
  });
  const font = `${FONT_FAMILY} ${size}`;
  return cropToInk(
    sharp({ text: { text: escapeXml(text), font, fontfile: fontFile } }).extractChannel(0),
  );
}

async function drawLogo(logoFile: string, height: number): Promise<Mask> {
  const logo = await cropToInk(sharp(logoFile).extractChannel(3));
  const { data, info } = await sharp(logo.data, {
    raw: { width: logo.width, height: logo.height, channels: 1 },
  })
    .resize({ height })
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Copies `source` into the `width`-wide `target`, `left` pixels from its left edge. */
function pasteMask(target: Buffer, width: number, source: Mask, left: number): void {
  for (let y = 0; y < source.height; y++)
    source.data.copy(target, y * width + left, y * source.width, (y + 1) * source.width);
}

// Pillow's grayscale weights, so the tone matches the mark on the website's other images.
const luminance = (data: Buffer, at: number) =>
  (data[at] * 19595 + data[at + 1] * 38470 + data[at + 2] * 7471 + 0x8000) >> 16;

/**
 * Colors `mask`, placed at `left` and `top`, as RGBA in a lighter tone of a dark background or a
 * darker tone of a light one. Smooth dark areas get the faintest mark, bright or busy ones more.
 */
async function toneMark(
  { data, info }: RawImage,
  mask: Mask,
  left: number,
  top: number,
  size: number,
): Promise<Buffer> {
  const blurred = await sharp(data, { raw: info })
    .blur(Math.max(1, size / TEXTURE_BLUR_DIVISOR))
    .raw()
    .toBuffer();
  const under = Buffer.alloc(mask.width * mask.height);
  let [count, sum, squares, texture] = [0, 0, 0, 0];
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      const at = ((top + y) * info.width + left + x) * info.channels;
      const value = luminance(data, at);
      under[y * mask.width + x] = value;
      // Only the pixels under the logo and the letters count, not the gaps between them.
      if (!mask.data[y * mask.width + x]) continue;
      count++;
      sum += value;
      squares += value * value;
      texture += Math.max(
        Math.abs(data[at] - blurred[at]),
        Math.abs(data[at + 1] - blurred[at + 1]),
        Math.abs(data[at + 2] - blurred[at + 2]),
      );
    }
  }
  const brightness = sum / count;
  const detail = Math.min(
    1,
    Math.sqrt(Math.max(0, squares / count - brightness ** 2)) / FULL_DETAIL_SPREAD,
  );
  const busy = Math.sqrt(Math.min(1, texture / count / FULL_BUSY_TEXTURE));
  const darkBusy = busy * Math.max(0, (DARK_BUSY_LIMIT - brightness) / DARK_BUSY_LIMIT);
  const opacity = Math.min(
    MAX_MARK_OPACITY,
    MARK_OPACITY *
      (DARK_OPACITY_SCALE + BRIGHTNESS_OPACITY_SCALE * Math.min(1, brightness / MID_GRAY)) *
      (1 + DARK_BUSY_BOOST * darkBusy + BUSY_BOOST * busy),
  );
  const offset =
    BASE_TONE_OFFSET +
    DETAIL_TONE_OFFSET * detail +
    DARK_BUSY_TONE_OFFSET * darkBusy +
    BUSY_TONE_OFFSET * busy;
  const direction = brightness < MID_GRAY ? 1 : -1;
  const tone = await sharp(under, { raw: { width: mask.width, height: mask.height, channels: 1 } })
    .blur(Math.max(1, mask.height / TONE_BLUR_DIVISOR))
    .extractChannel(0)
    .raw()
    .toBuffer();
  const overlay = Buffer.alloc(mask.width * mask.height * 4);
  for (let index = 0; index < tone.length; index++) {
    const shade = Math.max(0, Math.min(255, Math.round(tone[index] + direction * offset)));
    overlay.fill(shade, index * 4, index * 4 + 3);
    overlay[index * 4 + 3] = Math.round(mask.data[index] * opacity);
  }
  return overlay;
}

/** The website's grape logo, then the text, in the bottom right corner, with no tiled text. */
async function watermark(
  image: RawImage,
  { text, corner }: ImageSettings["watermark"],
  fontFile: string,
  logoFile: string,
): Promise<OverlayOptions[]> {
  if (!corner || !text.trim()) return [];
  const { width, height } = image.info;
  const short = Math.min(width, height);
  const size = Math.max(13, Math.round(short * 0.026));
  const margin = Math.max(12, Math.round(short * 0.024));
  const letters = await drawText(text, size, fontFile);
  const logo = await drawLogo(logoFile, letters.height);
  const gap = Math.max(5, Math.floor(size / 3));
  const mark = { width: logo.width + gap + letters.width, height: letters.height };
  // sharp refuses an overlay larger than the image, which a small original can produce.
  if (mark.width + margin > width || mark.height + margin > height) return [];
  const mask = Buffer.alloc(mark.width * mark.height);
  pasteMask(mask, mark.width, logo, 0);
  pasteMask(mask, mark.width, letters, logo.width + gap);
  const left = width - margin - mark.width;
  const top = height - margin - mark.height;
  const input = await toneMark(image, { data: mask, ...mark }, left, top, size);
  return [{ input, raw: { width: mark.width, height: mark.height, channels: 4 }, left, top }];
}

// The PLUS DataMining value that prohibits AI and machine learning training on the image.
const AI_TRAINING_PROHIBITED = "http://ns.useplus.org/ldf/vocab/DMI-PROHIBITED-AIMLTRAINING";

function rightsXmp({ author, copyright, usageTerms }: ImageSettings["rights"]): string {
  return (
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmlns:plus="http://ns.useplus.org/ldf/xmp/1.0/">` +
    `<dc:creator><rdf:Seq><rdf:li>${escapeXml(author)}</rdf:li></rdf:Seq></dc:creator>` +
    `<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(copyright)}</rdf:li></rdf:Alt></dc:rights>` +
    `<xmpRights:Marked>True</xmpRights:Marked>` +
    `<xmpRights:UsageTerms><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(usageTerms)}</rdf:li></rdf:Alt></xmpRights:UsageTerms>` +
    `<plus:DataMining rdf:resource="${AI_TRAINING_PROHIBITED}"/></rdf:Description></rdf:RDF></x:xmpmeta>`
  );
}

/**
 * Runs a proxy or render job. A render is the gallery image, at most 800 px on the long side, with
 * the watermark and the rights metadata, and none of the original's metadata, such as GPS.
 */
export async function renderJob(job: Job): Promise<Rendered> {
  if (job.kind === "proxy") {
    const { data, info } = await straightenAndCrop(job.file, job.orientation, PROXY_LONG_SIDE);
    const bytes = await sharp(data, { raw: info }).webp().toBuffer();
    return { bytes, width: info.width, height: info.height };
  }
  const image = await straightenAndCrop(job.file, job.recipe, OUTPUT_LONG_SIDE);
  const { data, info } = image;
  const { rights } = job.settings;
  const logoFile = path.join(job.siteFolder, SITE_LOGO);
  const bytes = await sharp(data, { raw: info })
    .composite(await watermark(image, job.settings.watermark, job.fontFile, logoFile))
    .withExif({ IFD0: { Artist: rights.author, Copyright: rights.copyright } })
    .withXmp(rightsXmp(rights))
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  return { bytes, width: info.width, height: info.height };
}
