import sharp from "sharp";
import type { EditRecipe } from "../models";

export const DATA_MINING_NOTICE =
  "http://ns.useplus.org/ldf/vocab/DMI-PROHIBITED-AIMLTRAINING";
export const escapeXml = (text: string) =>
  text.replace(
    /[<>&"']/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );

/** Render masks at the final dimensions; the shared strength scales both inscriptions. */
function inscriptionMask(
  width: number,
  height: number,
  text: string,
  corner: boolean,
): Buffer {
  const size = Math.max(12, Math.min(width, height) * 0.027);
  const margin = Math.max(12, Math.min(width, height) * 0.024);
  let lettering = "";
  if (corner) {
    // Fit long author names rather than clipping the signature outside the image.
    const fittedSize = Math.min(
      size,
      (width - margin * 2) / Math.max(1, text.length * 0.58),
    );
    lettering = `<text x="${width - margin}" y="${height - margin}" text-anchor="end" font-size="${Math.max(1, fittedSize)}">${escapeXml(text)}</text>`;
  } else {
    const spacing = Math.max(215, Math.min(width, height) * 0.54);
    const rowSpacing = Math.max(140, Math.min(width, height) * 0.3);
    for (
      let row = 0, y = -rowSpacing;
      y < height + rowSpacing;
      row++, y += rowSpacing
    ) {
      for (let x = -spacing; x < width + spacing; x += spacing) {
        const at = x + (row % 2 ? spacing / 2 : 0);
        lettering += `<text x="${at}" y="${y}" transform="rotate(-19 ${at} ${y})">${escapeXml(text)}</text>`;
      }
    }
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g fill="white" font-family="sans-serif" font-size="${size}">${lettering}</g></svg>`,
  );
}

/** Adaptive grayscale lettering stays subtle on smooth skies and shadows, legible over detail. */
export async function protectedPixels(
  pixels: Buffer,
  width: number,
  height: number,
  channels: number,
  recipe: EditRecipe,
): Promise<Buffer> {
  const mark = recipe.watermark;
  if ((!mark.tiled && !mark.corner) || mark.strength === 0 || !mark.text)
    return pixels;
  const raw = { width, height, channels: channels as 3 | 4 };
  const luminance = await sharp(pixels, { raw })
    .greyscale()
    .removeAlpha()
    .raw()
    .toBuffer();
  const softened = await sharp(pixels, { raw })
    .blur(Math.max(1, (Math.min(width, height) * 0.027) / 6))
    .raw()
    .toBuffer();
  const texture = Buffer.alloc(width * height);
  for (let index = 0; index < texture.length; index++) {
    for (let channel = 0; channel < Math.min(3, channels); channel++)
      texture[index] = Math.max(
        texture[index],
        Math.abs(
          pixels[index * channels + channel] -
            softened[index * channels + channel],
        ),
      );
  }
  const smoothedTexture = await sharp(texture, {
    raw: { width, height, channels: 1 },
  })
    .blur(Math.max(1, (Math.min(width, height) * 0.027) / 5))
    .greyscale()
    .raw()
    .toBuffer();
  const tile = mark.tiled
    ? await sharp(inscriptionMask(width, height, mark.text, false))
        .ensureAlpha()
        .extractChannel("alpha")
        .raw()
        .toBuffer()
    : null;
  const corner = mark.corner
    ? await sharp(inscriptionMask(width, height, mark.text, true))
        .ensureAlpha()
        .extractChannel("alpha")
        .raw()
        .toBuffer()
    : null;
  const outerTile = tile
    ? await sharp(tile, { raw: { width, height, channels: 1 } })
        .dilate(1)
        .greyscale()
        .raw()
        .toBuffer()
    : null;
  const output = Buffer.from(pixels);
  const scale = mark.strength / 0.16;
  for (let index = 0; index < width * height; index++) {
    const light = luminance[index];
    const detail = Math.sqrt(Math.min(1, smoothedTexture[index] / 12));
    const dark = Math.max(0, (140 - light) / 140);
    // Previous Python treatment starts at 7/255. Six is a restrained 14% reduction.
    const tileAlpha = Math.min(
      1,
      (6 / 255) *
        scale *
        (1 +
          0.45 * Math.max(0, (36 - light) / 36) ** 2 +
          2.8 * detail +
          2.2 * detail * dark) *
        (1 - 0.5 * Math.max(0, Math.min(1, (light - 170) / 75))),
    );
    const tileTone = light >= 130 ? 20 : 244;
    const cornerAlpha = Math.min(
      0.55,
      (92 / 255) *
        scale *
        (0.55 + 0.45 * Math.min(1, light / 128)) *
        (1 + 1.2 * detail * dark + 0.4 * detail),
    );
    const cornerTone = Math.max(
      0,
      Math.min(
        255,
        light +
          (light < 128 ? 1 : -1) * (60 + 20 * detail + 20 * detail * dark),
      ),
    );
    for (let channel = 0; channel < Math.min(3, channels); channel++) {
      const at = index * channels + channel;
      let value = output[at];
      if (tile && outerTile) {
        const edgeAlpha = Math.min(
          1,
          (6 / 255) *
            scale *
            2 *
            detail *
            (1 - 0.5 * Math.max(0, Math.min(1, (light - 170) / 75))),
        );
        value +=
          (((light >= 130 ? 244 : 20) - value) *
            edgeAlpha *
            Math.max(0, outerTile[index] - tile[index])) /
          255;
        value += ((tileTone - value) * tileAlpha * tile[index]) / 255;
      }
      if (corner)
        value += ((cornerTone - value) * cornerAlpha * corner[index]) / 255;
      output[at] = Math.round(value);
    }
  }
  return output;
}

/** Fresh allowlisted notices communicate restrictions without copying private source metadata. */
export function rightsXmp(recipe: EditRecipe): string {
  const rights = recipe.rights;
  return `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmlns:plus="http://ns.useplus.org/ldf/xmp/1.0/"><dc:creator><rdf:Seq><rdf:li>${escapeXml(rights.author)}</rdf:li></rdf:Seq></dc:creator><dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(rights.copyright)}</rdf:li></rdf:Alt></dc:rights><xmpRights:Marked>True</xmpRights:Marked><xmpRights:UsageTerms><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(rights.usageNotice)}</rdf:li></rdf:Alt></xmpRights:UsageTerms><plus:DataMining rdf:resource="${DATA_MINING_NOTICE}"/></rdf:Description></rdf:RDF></x:xmpmeta>`;
}
