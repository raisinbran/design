import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { workspaceFile } from "./files";
const mime: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
};
export class SitePreview {
  private server?: Server;
  async start(root: string, page: string): Promise<string> {
    if (
      ![
        "index.html",
        "photography.html",
        "engineeringdesign.html",
        "creativedesign.html",
      ].includes(page)
    )
      throw new Error("Unsupported preview page");
    await this.stop();
    const token = randomBytes(24).toString("hex");
    this.server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url || "/", "http://127.0.0.1");
        if (
          !url.pathname.startsWith(`/${token}/`) ||
          !["GET", "HEAD"].includes(request.method || "")
        )
          throw new Error("Invalid preview request");
        const relative =
          decodeURIComponent(url.pathname.slice(token.length + 2)) ||
          "index.html";
        if (
          /[\\\x00-\x1f]/.test(relative) ||
          relative.split("/").some((part) => part === "." || part === "..") ||
          path.isAbsolute(relative)
        )
          throw new Error("Invalid preview path");
        if (
          relative.startsWith(".") ||
          !/^(?:[^/]+\.html|favicon\.ico|(?:js|css|assets|images|photography|video)\/|data\/(?:media|engineering|archive)-catalog\.json$)/.test(
            relative,
          )
        )
          throw new Error("Preview resource is not public");
        const bytes = await readFile(await workspaceFile(root, relative));
        response.writeHead(200, {
          "Content-Type":
            mime[path.extname(relative)] || "application/octet-stream",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        response.end(request.method === "HEAD" ? undefined : bytes);
      } catch {
        response.writeHead(404);
        response.end("Preview resource unavailable");
      }
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(0, "127.0.0.1", resolve);
    });
    const address = this.server.address();
    if (!address || typeof address === "string")
      throw new Error("Preview could not start");
    return `http://127.0.0.1:${address.port}/${token}/${page}`;
  }
  async stop() {
    if (this.server) {
      const server = this.server;
      this.server = undefined;
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}
