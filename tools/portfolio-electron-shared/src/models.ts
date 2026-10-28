/** Public catalogs retain extension fields when edited; never rebuild records from a whitelist. */
export interface ExtensibleRecord {
  [key: string]: unknown;
}
export type ThemePreference = "system" | "light" | "dark";
export type AppId = "portfolio-studio" | "photo-processor";
export type DisplayPriority = "low" | "normal" | "portraitBoost" | "featured";
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Photo extends ExtensibleRecord {
  file: string;
  alt: string;
  visible: boolean;
  featured: boolean;
  displayPriority: DisplayPriority;
  aspectRatio: number;
  tags: string[];
  thumbnail?: string;
  thumbnailVersion?: string;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  thumbnailFramed?: boolean;
  mediaVersion?: string;
  galleryCrop?: CropRect;
  galleryZoom?: number;
  /** True means thumbnail is the sole public file; file remains the stable catalog key. */
  publishedImage?: boolean;
  tagStatus?: string;
  altNeedsReview?: boolean;
}
export interface PhotoCatalog extends ExtensibleRecord {
  schemaVersion: 1;
  photoTags: string[];
  /** Array order is the saved gallery order. */
  photos: Photo[];
}
export interface EngineeringMedia extends ExtensibleRecord {
  kind: "image" | "video";
  src: string;
  alt: string;
  caption: string;
  credit: string;
  html?: string;
}
export interface EngineeringProject extends ExtensibleRecord {
  id: string;
  title: string;
  heading: string;
  context: string;
  bodyHtml: string;
  cover: string;
  coverPosition: string;
  media: EngineeringMedia[];
  visible: boolean;
  expanded: boolean;
  legacyHtml?: string;
  separator?: string;
  baseline?: ExtensibleRecord;
}
export interface EngineeringCatalog extends ExtensibleRecord {
  schemaVersion: 1;
  projects: EngineeringProject[];
}
export type HtmlAttributes = Record<string, string | string[]>;
export interface ArchiveMedia extends ExtensibleRecord {
  id: string;
  src: string;
  alt: string;
  caption: string;
  credit: string;
  cropMode: "natural" | "square";
  displayRatio: number | null;
  position: string;
  prominence: DisplayPriority;
  figureAttributes: HtmlAttributes;
  imageAttributes: HtmlAttributes;
}
export interface ArchiveCollection extends ExtensibleRecord {
  id: string;
  title: string;
  heading: string;
  context: string;
  cover: string;
  coverPosition: string;
  coverSize: "cover" | "contain" | "auto";
  headerMinHeight: string;
  expanded: boolean;
  media: ArchiveMedia[];
}
export interface ArchiveCatalog extends ExtensibleRecord {
  schemaVersion: 1;
  sourceHtml: string;
  sourceSha256: string;
  settingsSource: string;
  prominenceOverrides: Record<string, DisplayPriority>;
  collections: ArchiveCollection[];
}
export interface WorkspaceCatalogs {
  photography: PhotoCatalog;
  engineering: EngineeringCatalog;
  archive: ArchiveCatalog;
}

/** Private records live in the application's user-data directory outside the selected repository. */
export interface EditRecipe {
  version: 1;
  rotation: number;
  straighten: number;
  crop?: CropRect;
  maxSide: number;
  format: "webp" | "jpeg" | "png";
  quality: number;
  watermark: {
    tiled: boolean;
    corner: boolean;
    strength: number;
    text: string;
  };
  rights: { author: string; copyright: string; usageNotice: string };
}
export interface PrivatePhotoSource {
  version: 1;
  photoKey: string;
  workspaceId: string;
  originalPath: string;
  recipe: EditRecipe;
}
export interface ArrangementState {
  /** Locks constrain suggestions and manual movement to the same absolute positions. */
  lockedPhotoKeys: string[];
  openingOrder: string[];
}
export interface AppDefinition {
  id: AppId;
  name: string;
  sections: readonly string[];
  primaryAction: string;
  ownsPixelProcessing: boolean;
}
