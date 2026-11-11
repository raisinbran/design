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

/** Awaits `action` and passes the message of any error it throws to `showError`. */
export async function runShowingErrors(
  action: () => Promise<void>,
  showError: (message: string) => void,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
}

/** The `portfolio:` URL of a site image, such as "images/Bolt/File_005_edit.jpg". */
export const siteImage = (file: string) =>
  "portfolio://site/" + file.split("/").map(encodeURIComponent).join("/");
