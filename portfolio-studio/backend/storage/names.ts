import path from "node:path";

const UNSAFE_NAME = /[\\/<>:"|?*\x00-\x1f]|^\.{1,2}$|[. ]$/;
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** A catalog name is a label for the source photo, not the encoding of its WebP derivative. */
export function photoNameProblem(name: string): string | null {
  if (!name || name.length > 200 || UNSAFE_NAME.test(name) || RESERVED_NAME.test(name)) {
    return `"${name}" cannot be used as a photo name on Windows or macOS`;
  }
  if (!/\.(heic|heif|jpe?g|png|tiff?|webp|avif)$/i.test(name)) {
    return "Keep the source photo extension, such as .heic or .jpg, in the catalog name";
  }
  return null;
}

/** Published photos are encoded to WebP regardless of the private original's extension. */
export function webpName(catalogName: string): string {
  return path.parse(catalogName).name + ".webp";
}
