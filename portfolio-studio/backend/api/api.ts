// Types only. The frontend imports this file with `import type`, so nothing here reaches the renderer bundle.
import type { z } from "zod";
import type { Catalogs as CatalogsSchema } from "../catalogs/schema";

type R<T> = Promise<Result<T>>;

export interface PortfolioApi {
  /** null: no folder is set, or the folder is gone. */
  "portfolio.load"(): R<PortfolioView | null>;
  /** Asks for a folder and remembers it; null: the owner cancelled. */
  "portfolio.choose"(): R<PortfolioView | null>;
  "catalogs.save"(revision: Revision, catalogs: Catalogs): R<PortfolioView>;
  /** Asks for one original and keeps a draft of it; null: the owner cancelled. */
  "photos.import"(): R<SourceHandle | null>;
  /** The original and recipe saved when the photo was added; "source-missing" when there is none or the file moved. */
  "photos.openSaved"(photoKey: string): R<SavedSource>;
  /** Asks for the photo's original and remembers it; null: the owner cancelled. */
  "photos.relink"(photoKey: string): R<SavedSource | null>;
  /** Screen-sized preview of the straightened original, uncropped. */
  "photos.proxy"(sourceId: string, orientation: Orientation): R<ImageRef>;
  "photos.render"(sourceId: string, recipe: Recipe): R<ImageRef>;
  /** Stops the running proxy or render, which then returns "cancelled". */
  "photos.cancel"(): R<null>;
  /** Writes the source's latest render to the site. */
  "photos.add"(request: AddRequest): R<Added>;
  /** The saved drafts whose originals still exist, each with a fresh source id. */
  "photos.drafts"(): R<Draft[]>;
  "photos.saveDraft"(sourceId: string, recipe: Recipe): R<null>;
  "photos.discardDraft"(sourceId: string): R<null>;
  /** Opens the saved page in the default browser. */
  "site.open"(page: Page): R<null>;
  "settings.get"(): R<AppSettings>;
  /** Changes the image settings; only "Choose folder" changes the folder. */
  "settings.set"(settings: ImageSettings): R<AppSettings>;
  "app.info"(): R<AppInfo>;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: ApiError };

export interface ApiError {
  code:
    "changed-outside" | "invalid" | "name-conflict" | "source-missing" | "cancelled" | "internal";
  message: string;
  /** "invalid" only, such as "data/media-catalog.json photos #1 (DSCF3655_crop.jpg) alt: description is required". */
  problems?: string[];
}

export type Catalogs = z.infer<typeof CatalogsSchema>;

/** The hash of each file as loaded; a save refuses to run when any file no longer matches. */
export type Revision = Record<string, string>;

export interface PortfolioView {
  folder: string;
  revision: Revision;
  catalogs: Catalogs;
}

export type Page = "photography" | "engineering" | "archive";

/** An original the backend has registered. The UI never sees its path. */
export interface SourceHandle {
  id: string;
  /** The original's file name, the default photo name. */
  name: string;
}

export interface SavedSource {
  source: SourceHandle;
  recipe: Recipe;
}

export type Draft = SavedSource;

export interface Orientation {
  /** Quarter turns clockwise, in degrees. */
  rotation: 0 | 90 | 180 | 270;
  /** Degrees clockwise, from -45 to 45. */
  straighten: number;
}

export interface Recipe extends Orientation {
  /** Fractions of the proxy image, which shows the safe rectangle; none keeps all of it. */
  crop?: { x: number; y: number; width: number; height: number };
}

/** A `portfolio://preview/` image held in memory by the backend. */
export interface ImageRef {
  url: string;
  width: number;
  height: number;
  bytes: number;
}

export type AddRequest =
  // New photo: the name becomes the photo key and photography/thumbnails/<name>.webp.
  | {
      kind: "new";
      revision: Revision;
      sourceId: string;
      name: string;
      alt: string;
      tags: string[];
      overwrite?: boolean;
    }
  // Edit Image: replaces the gallery image of an existing photo, keeping its record.
  | { kind: "replace"; revision: Revision; sourceId: string; photoKey: string };

export interface Added {
  view: PortfolioView;
  photoKey: string;
}

export interface ImageSettings {
  /** Written into every image the app adds, as EXIF and XMP. */
  rights: { author: string; copyright: string; usageTerms: string };
  watermark: {
    text: string;
    tiled: boolean;
    corner: boolean;
    /** Opacity of both marks, from 0 to 1. */
    strength: number;
  };
}

export interface AppSettings extends ImageSettings {
  /** The portfolio folder, the root of the website repository. */
  folder: string | null;
}

export interface AppInfo {
  app: string;
  electron: string;
  sharp: string;
  libvips: string;
}
