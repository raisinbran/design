export function publishedImageDescription(photo: { file: string; thumbnail?: string }): string {
  if (!photo.thumbnail) return `photography/published/${photo.file}`;
  const extension = photo.thumbnail.split(".").at(-1)?.toLowerCase();
  const format =
    extension === "jpg" || extension === "jpeg"
      ? "JPEG"
      : extension === "png"
        ? "PNG"
        : extension === "webp"
          ? "WebP"
          : (extension?.toUpperCase() ?? "Unknown format");
  return `photography/thumbnails/${photo.thumbnail} (${format})`;
}
