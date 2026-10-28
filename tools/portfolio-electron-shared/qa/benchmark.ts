import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { defaultRecipe } from "../src/renderer/editor-state";

async function render(originalPath: string, index: number) {
  const start = performance.now();
  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(
      path.resolve(
        "tools/photo-processor-electron/.vite/build/image-worker.js",
      ),
      {
        workerData: {
          action: "render",
          originalPath,
          recipe: {
            ...defaultRecipe(),
            crop: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
          },
        },
      },
    );
    worker.on("message", (message) => {
      if (message.progress) return;
      message.ok ? resolve() : reject(new Error(message.error));
    });
    worker.once("error", reject);
  });
  return { index, ms: performance.now() - start };
}
async function main() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "portfolio-benchmark-"),
  );
  try {
    const sharp: typeof import("sharp") = createRequire(import.meta.url)(
      "../../photo-processor-electron/node_modules/sharp",
    );
    const original = path.join(directory, "synthetic-12mp.jpg");
    await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: "#497f93" },
    })
      .jpeg({ quality: 92 })
      .toFile(original);
    const start = performance.now();
    const photos = [];
    for (let index = 0; index < 10; index++)
      photos.push(await render(original, index));
    const report = {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      cpus: os.availableParallelism(),
      input:
        "synthetic 4000x3000 JPEG, crop .9x.9, 800px WebP78, protection enabled; fresh worker per photo",
      totalMs: performance.now() - start,
      photos,
    };
    console.log(JSON.stringify(report, null, 2));
    if (process.env.PORTFOLIO_BENCHMARK_OUTPUT)
      await writeFile(
        process.env.PORTFOLIO_BENCHMARK_OUTPUT,
        JSON.stringify(report, null, 2),
      );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
