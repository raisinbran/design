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
  /** Opens the saved page in the default browser. */
  "site.open"(page: Page): R<null>;
  "app.info"(): R<AppInfo>;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: ApiError };

export interface ApiError {
  code: "changed-outside" | "invalid" | "internal";
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

export interface AppSettings {
  /** The portfolio folder, the root of the website repository. */
  folder: string | null;
}

export interface AppInfo {
  app: string;
  electron: string;
  sharp: string;
  libvips: string;
}
