import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { workspaceFile, type WorkspaceRegistry } from "./files";
/** Only selected-workspace raster images can cross the preview bridge; no HTML or arbitrary files. */
export async function readWorkspaceImage(
  registry: WorkspaceRegistry,
  workspaceId: string,
  relative: unknown,
): Promise<string> {
  if (
    typeof relative !== "string" ||
    !/^(photography|images|assets)\//.test(relative)
  )
    throw new Error("Choose a portfolio image");
  const mime: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif",
  };
  const contentType = mime[path.extname(relative).toLowerCase()];
  if (!contentType) throw new Error("Unsupported preview image format");
  const filename = await workspaceFile(registry.root(workspaceId), relative);
  if ((await stat(filename)).size > 40 * 1024 * 1024)
    throw new Error("Image is too large for a catalog preview");
  return `data:${contentType};base64,${(await readFile(filename)).toString("base64")}`;
}
