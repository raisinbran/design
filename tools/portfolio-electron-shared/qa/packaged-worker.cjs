const { Worker } = require("node:worker_threads");
const assert = require("node:assert/strict");
const path = require("node:path");
const [asar, originalPath] = process.argv.slice(2);
const sharp = require(path.join(asar, "node_modules/sharp"));
// Explicit resolution proves that system/development modules are not satisfying the package.
assert.ok(
  require.resolve(path.join(asar, "node_modules/sharp")).startsWith(asar),
);
const recipe = {
  version: 1,
  rotation: 0,
  straighten: 0,
  maxSide: 800,
  format: "webp",
  quality: 78,
  watermark: {
    tiled: true,
    corner: true,
    strength: 0.16,
    text: "Brandon J. Chen",
  },
  rights: {
    author: "Brandon J. Chen",
    copyright: "Copyright (c) Brandon J. Chen",
    usageNotice: "AI/ML training is not authorized.",
  },
};
const worker = new Worker(path.join(asar, ".vite/build/image-worker.js"), {
  workerData: { action: "render", originalPath, recipe },
});
let answered = false;
worker.on("message", async (message) => {
  if (message.progress) return;
  answered = true;
  try {
    assert.equal(message.ok, true, message.error);
    const metadata = await sharp(message.value.bytes).metadata();
    assert.equal(metadata.width, 32);
    assert.equal(metadata.height, 24);
    assert.ok(metadata.xmp.toString().includes("DMI-PROHIBITED-AIMLTRAINING"));
    assert.ok(
      metadata.exif.includes(Buffer.from("Brandon J. Chen", "utf16le")),
    );
    console.log(
      JSON.stringify({
        asar,
        heic: true,
        width: metadata.width,
        height: metadata.height,
        bytes: message.value.bytes.length,
        sharp: sharp.versions.sharp,
      }),
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
});
worker.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
worker.on("exit", () => {
  if (!answered) {
    console.error("Packaged worker exited without output");
    process.exitCode = 1;
  }
});
