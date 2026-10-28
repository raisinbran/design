import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import decodeHeic from "heic-decode";
import type { EditRecipe } from "../models";
import { validateRecipe } from "./recipe";
import { protectedPixels, rightsXmp } from "./protection";
export { rightsXmp } from "./protection";

export interface RenderedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
  format: EditRecipe["format"];
  sourceDigest: string;
}
export type ProcessingStage =
  | "read"
  | "orientation"
  | "straighten"
  | "crop"
  | "resize"
  | "protection"
  | "encode";
export function isHeic(bytes: Uint8Array): boolean {
  const header = Buffer.from(bytes.subarray(0, 64)).toString("ascii");
  return (
    header.slice(4, 8) === "ftyp" &&
    !/avif|avis/.test(header) &&
    /heic|heix|hevc|hevx|mif1/.test(header)
  );
}
export async function renderImage(
  originalPath: string,
  input: unknown,
  progress: (stage: ProcessingStage) => void = () => {},
): Promise<RenderedImage> {
  const recipe = validateRecipe(input);
  progress("read");
  let original: Buffer;
  try {
    original = await readFile(originalPath);
  } catch {
    throw new Error(
      "Original is unavailable. Relink the original before processing.",
    );
  }
  const sourceDigest = createHash("sha256").update(original).digest("hex");
  progress("orientation");
  // libheif's bundled decoder applies HEIF transforms; other formats use their EXIF orientation.
  const inputImage = isHeic(original)
    ? await decodeHeic({ buffer: original }).then((image) => {
        if (
          image.width * image.height > 100_000_000 ||
          image.width < 1 ||
          image.height < 1
        )
          throw new Error(
            "Original exceeds the 100 megapixel processing limit",
          );
        return sharp(Buffer.from(image.data), {
          raw: { width: image.width, height: image.height, channels: 4 },
        });
      })
    : sharp(original, { limitInputPixels: 100_000_000 }).autoOrient();
  let raster = await inputImage
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (recipe.rotation)
    raster = await sharp(raster.data, { raw: raster.info })
      .rotate(recipe.rotation)
      .raw()
      .toBuffer({ resolveWithObject: true });
  progress("straighten");
  if (recipe.straighten)
    raster = await sharp(raster.data, { raw: raster.info })
      .rotate(recipe.straighten, { background: "#ffffff" })
      .raw()
      .toBuffer({ resolveWithObject: true });
  progress("crop");
  if (recipe.crop) {
    const left = Math.round(recipe.crop.x * raster.info.width);
    const top = Math.round(recipe.crop.y * raster.info.height);
    const width = Math.min(
      raster.info.width - left,
      Math.max(1, Math.round(recipe.crop.width * raster.info.width)),
    );
    const height = Math.min(
      raster.info.height - top,
      Math.max(1, Math.round(recipe.crop.height * raster.info.height)),
    );
    raster = await sharp(raster.data, { raw: raster.info })
      .extract({ left, top, width, height })
      .raw()
      .toBuffer({ resolveWithObject: true });
  }
  progress("resize");
  raster = await sharp(raster.data, { raw: raster.info })
    .resize({
      width: recipe.maxSide,
      height: recipe.maxSide,
      fit: "inside",
      withoutEnlargement: true,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  progress("protection");
  const protectedRaster = await protectedPixels(
    raster.data,
    raster.info.width,
    raster.info.height,
    raster.info.channels,
    recipe,
  );
  let image = sharp(protectedRaster, { raw: raster.info });
  image = image
    .withExif({
      IFD0: {
        Artist: recipe.rights.author,
        XPAuthor: recipe.rights.author,
        Copyright: recipe.rights.copyright,
      },
      IFD2: { UserComment: recipe.rights.usageNotice },
    })
    .withXmp(rightsXmp(recipe));
  progress("encode");
  const bytes = await (
    recipe.format === "webp"
      ? image.webp({ quality: recipe.quality })
      : recipe.format === "jpeg"
        ? image
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: recipe.quality })
        : image.png({ compressionLevel: 9 })
  ).toBuffer();
  return {
    bytes,
    width: raster.info.width,
    height: raster.info.height,
    format: recipe.format,
    sourceDigest,
  };
}
