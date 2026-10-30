// Types only. The frontend imports this file with `import type`, so nothing here reaches the renderer bundle.

type R<T> = Promise<Result<T>>;

export interface PortfolioApi {
  /** null: no folder is set, or the folder is gone. */
  "portfolio.load"(): R<PortfolioView | null>;
  /** Asks for a folder and remembers it; null: the owner cancelled. */
  "portfolio.choose"(): R<PortfolioView | null>;
  "app.info"(): R<AppInfo>;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: ApiError };

export interface ApiError {
  code: "internal";
  message: string;
}

export interface PortfolioView {
  folder: string;
}

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
