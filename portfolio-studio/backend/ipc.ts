import type { PortfolioApi } from "./api/api";

/** Every API method. The preload exposes exactly these names on `window.portfolio`. */
export const METHODS = [
  "portfolio.load",
  "portfolio.choose",
  "catalogs.save",
  "site.open",
  "app.info",
] as const;

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
// Fails to compile when METHODS and PortfolioApi name different methods.
true satisfies Same<(typeof METHODS)[number], keyof PortfolioApi>;
