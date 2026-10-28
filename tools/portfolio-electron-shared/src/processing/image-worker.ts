import { parentPort, workerData } from "node:worker_threads";
import sharp from "sharp";
import type { ImageCapabilities } from "../contracts";
import { renderImage } from "./render-image";
async function execute(request: unknown): Promise<unknown> {
  if (!request || typeof request !== "object")
    throw new Error("Unsupported image operation");
  const command = request as {
    action: string;
    originalPath?: string;
    recipe?: unknown;
  };
  if (command.action === "capabilities")
    return {
      formats: [
        ...Object.entries(sharp.format)
          .filter(([, format]) => format.input.file)
          .map(([name]) => name),
        "heic",
      ],
      heic: true,
      runtime: `sharp ${sharp.versions.sharp}; libvips ${sharp.versions.vips}; bundled libheif decoder`,
    } satisfies ImageCapabilities;
  if (command.action === "render" && typeof command.originalPath === "string")
    return renderImage(command.originalPath, command.recipe, (stage) =>
      parentPort?.postMessage({ progress: stage }),
    );
  throw new Error("Unsupported image operation");
}
execute(workerData).then(
  (value) => parentPort?.postMessage({ ok: true, value }),
  (error) => parentPort?.postMessage({ ok: false, error: String(error) }),
);
