import { readFile } from "node:fs/promises";
import decodeHeic from "heic-decode";
import sharp, { type OverlayOptions, type Sharp } from "sharp";
import type { ImageSettings, Orientation, Recipe } from "../api/api";

export const OUTPUT_LONG_SIDE = 800;
export const PROXY_LONG_SIDE = 1600;
export const WEBP_QUALITY = 78;
export const PIXEL_LIMIT = 100_000_000;
export const FONT_FAMILY = "Liberation Sans Bold";
const TILE_ANGLE = -19;

export type Job =
  | { kind: "proxy"; file: string; orientation: Orientation }
  | { kind: "render"; file: string; recipe: Recipe; settings: ImageSettings; fontFile: string };

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

function textLayer(text: string, size: number, opacity: number, fontFile: string) {
  return sharp({
    text: {
      text: `<span foreground="white" alpha="${Math.round(opacity * 100)}%">${escapeXml(text)}</span>`,
      font: `${FONT_FAMILY} ${size}`,
      fontfile: fontFile,
      rgba: true,
    },
  });
}

/** The diagonal tiled text and the corner signature, both at the strength setting's opacity. */
async function watermark(
  width: number,
  height: number,
  { text, tiled, corner, strength }: ImageSettings["watermark"],
  fontFile: string,
): Promise<OverlayOptions[]> {
  if (!text.trim() || strength <= 0) return [];
  const size = Math.max(12, Math.round(Math.min(width, height) * 0.027));
  const margin = Math.max(12, Math.round(Math.min(width, height) * 0.024));
  const layers: OverlayOptions[] = [];
  if (tiled) {
    const gap = Math.max(60, Math.round(Math.min(width, height) * 0.2));
    const tile = await textLayer(text, size, strength, fontFile)
      .rotate(TILE_ANGLE, { background: "#00000000" })
      .extend({ right: gap, bottom: gap, background: "#00000000" })
      .png()
      .toBuffer({ resolveWithObject: true });
    // sharp refuses an overlay larger than the image, which a small original can produce.
    const fitted = await sharp(tile.data)
      .extract({
        left: 0,
        top: 0,
        width: Math.min(width, tile.info.width),
        height: Math.min(height, tile.info.height),
      })
      .toBuffer();
    layers.push({ input: fitted, tile: true });
  }
  if (corner) {
    const { data, info } = await textLayer(text, size, strength, fontFile)
      .png()
      .toBuffer({ resolveWithObject: true });
    if (info.width + margin <= width && info.height + margin <= height)
      layers.push({
        input: data,
        left: width - info.width - margin,
        top: height - info.height - margin,
      });
  }
  return layers;
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
 * Runs a proxy or render job. A render is the gallery image: at most 800 px on the long side, with
 * the watermark and the rights metadata, and none of the original's metadata, such as GPS.
 */
export async function renderJob(job: Job): Promise<Rendered> {
  if (job.kind === "proxy") {
    const { data, info } = await straightenAndCrop(job.file, job.orientation, PROXY_LONG_SIDE);
    const bytes = await sharp(data, { raw: info }).webp().toBuffer();
    return { bytes, width: info.width, height: info.height };
  }
  const { data, info } = await straightenAndCrop(job.file, job.recipe, OUTPUT_LONG_SIDE);
  const { rights } = job.settings;
  const bytes = await sharp(data, { raw: info })
    .composite(await watermark(info.width, info.height, job.settings.watermark, job.fontFile))
    .withExif({ IFD0: { Artist: rights.author, Copyright: rights.copyright } })
    .withXmp(rightsXmp(rights))
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  return { bytes, width: info.width, height: info.height };
}
