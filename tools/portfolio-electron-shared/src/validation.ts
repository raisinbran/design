import type {
  ArchiveCatalog,
  EngineeringCatalog,
  PhotoCatalog,
  WorkspaceCatalogs,
} from "./models";
export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`${label} must be text`);
}
export function safeBasename(value: unknown): asserts value is string {
  text(value, "Filename");
  if (!value || value === "." || value === ".." || /[\\/\x00-\x1f]/.test(value))
    throw new Error("Expected a safe filename");
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}
function schema(value: unknown) {
  const catalog = record(value, "Catalog");
  if (catalog.schemaVersion !== 1)
    throw new Error("Unsupported catalog schema version");
  return catalog;
}
function unique(values: unknown[], label: string, key: string) {
  const ids = values.map((item) => {
    const id = record(item, label)[key];
    text(id, `${label} identity`);
    return id;
  });
  if (new Set(ids).size !== ids.length)
    throw new Error(`Duplicate ${label} identity`);
}
export function validatePhotoCatalog(value: unknown): PhotoCatalog {
  const catalog = schema(value);
  array(catalog.photoTags, "Photo tags").forEach((tag) => text(tag, "Tag"));
  const photos = array(catalog.photos, "Photos");
  unique(photos, "photo", "file");
  photos.forEach((item) => {
    const photo = record(item, "Photo");
    safeBasename(photo.file);
    text(photo.alt, "Description");
    array(photo.tags, "Tags").forEach((tag) => text(tag, "Tag"));
    if (
      typeof photo.visible !== "boolean" ||
      typeof photo.featured !== "boolean"
    )
      throw new Error("Invalid photo visibility");
    if (
      !["normal", "low", "portraitBoost", "featured"].includes(
        String(photo.displayPriority),
      )
    )
      throw new Error("Invalid photo prominence");
    if (
      typeof photo.aspectRatio !== "number" ||
      !Number.isFinite(photo.aspectRatio) ||
      photo.aspectRatio <= 0
    )
      throw new Error("Invalid photo aspect ratio");
    if (photo.thumbnail !== undefined) safeBasename(photo.thumbnail);
    if (
      photo.publishedImage !== undefined &&
      typeof photo.publishedImage !== "boolean"
    )
      throw new Error("Invalid Published Image marker");
    if (photo.publishedImage === true && !photo.thumbnail)
      throw new Error("Published Image requires a thumbnail filename");
  });
  return value as PhotoCatalog;
}
export function validateEngineeringCatalog(value: unknown): EngineeringCatalog {
  const projects = array(schema(value).projects, "Projects");
  unique(projects, "project", "id");
  projects.forEach((item) => {
    const project = record(item, "Project");
    [
      "title",
      "heading",
      "context",
      "bodyHtml",
      "cover",
      "coverPosition",
    ].forEach((key) => text(project[key], key));
    array(project.media, "Project media").forEach((item) => {
      const media = record(item, "Media");
      if (!["image", "video"].includes(String(media.kind)))
        throw new Error("Unsupported project media");
      ["src", "alt", "caption", "credit"].forEach((key) =>
        text(media[key], key),
      );
    });
  });
  return value as EngineeringCatalog;
}
export function validateArchiveCatalog(value: unknown): ArchiveCatalog {
  const catalog = schema(value);
  ["sourceHtml", "sourceSha256", "settingsSource"].forEach((key) =>
    text(catalog[key], key),
  );
  const collections = array(catalog.collections, "Collections");
  unique(collections, "collection", "id");
  collections.forEach((item) => {
    const collection = record(item, "Collection");
    text(collection.title, "Title");
    const media = array(collection.media, "Archive media");
    unique(media, "archive media", "id");
    media.forEach((item) => {
      const photo = record(item, "Archive photo");
      ["src", "alt", "caption", "credit"].forEach((key) =>
        text(photo[key], key),
      );
    });
  });
  record(catalog.prominenceOverrides, "Prominence overrides");
  return value as ArchiveCatalog;
}
export function validateCatalogs(value: unknown): WorkspaceCatalogs {
  const catalogs = record(value, "Workspace catalogs");
  return {
    photography: validatePhotoCatalog(catalogs.photography),
    engineering: validateEngineeringCatalog(catalogs.engineering),
    archive: validateArchiveCatalog(catalogs.archive),
  };
}
