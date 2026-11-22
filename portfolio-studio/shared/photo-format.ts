/** The extension written to disk and served to the website, not the private source type. */
export const PHOTO_OUTPUT_FORMATS = ["webp", "jpg", "png", "heic"] as const;
export type PhotoOutputFormat = (typeof PHOTO_OUTPUT_FORMATS)[number];
export const DEFAULT_PHOTO_OUTPUT_FORMAT: PhotoOutputFormat = "webp";

export function isPhotoOutputFormat(value: unknown): value is PhotoOutputFormat {
  return PHOTO_OUTPUT_FORMATS.some((format) => format === value);
}

export function sourceNameWithoutExtension(source: string): string {
  const dot = source.lastIndexOf(".");
  return dot > 0 ? source.slice(0, dot) : source;
}

export function publishedFilename(name: string, format: PhotoOutputFormat): string {
  return `${name}.${format}`;
}

export function fileOutputFormat(filename: string): PhotoOutputFormat | null {
  const extension = filename.split(".").at(-1)?.toLowerCase();
  return isPhotoOutputFormat(extension) ? extension : null;
}

/** Reject extensions in Name: the adjacent Format control owns the real extension. */
export function photoBaseNameProblem(name: string): string | null {
  if (!name || name.length > 195 || /[\\/<>:"|?*\x00-\x1f]|^\.{1,2}$|[. ]$/.test(name)) {
    return "Enter a valid filename without a trailing dot, slash or reserved character";
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)) {
    return "That name is reserved on Windows";
  }
  if (/\.(heic|heif|jpe?g|png|tiff?|webp|avif)$/i.test(name)) {
    return "Remove the source file extension from Name and choose the output type separately";
  }
  return null;
}

export const photoMimeType = (format: PhotoOutputFormat): string =>
  ({
    webp: "image/webp",
    jpg: "image/jpeg",
    png: "image/png",
    heic: "image/heic",
  })[format];
