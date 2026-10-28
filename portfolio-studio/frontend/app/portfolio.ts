import type { PortfolioApi, Result } from "../../backend/api/api";

declare global {
  interface Window {
    portfolio: PortfolioApi;
  }
}

/** Returns the value of a successful call; throws the API error message otherwise. */
export async function call<T>(result: Promise<Result<T>>): Promise<T> {
  const settled = await result;
  if (!settled.ok) throw new Error(settled.error.message);
  return settled.value;
}
