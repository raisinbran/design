import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { renderImage, isHeic } from "../src/processing/render-image";
import { validateRecipe } from "../src/processing/recipe";
import { defaultRecipe } from "../src/renderer/editor-state";
import { ProcessingService } from "../src/main/processing";

test("orients before cropping/resizing, encodes once, preserves original bytes and strips private metadata", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "processor-pixels-"));
  try {
    const filename = path.join(directory, "private-source.jpg");
    const original = await sharp({
      create: { width: 120, height: 80, channels: 3, background: "#8040c0" },
    })
      .withExif({
        IFD0: { Orientation: "6", ImageDescription: "PRIVATE-SOURCE-PATH" },
      })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    await writeFile(filename, original);
    const recipe = defaultRecipe();
    recipe.maxSide = 64;
    recipe.crop = { x: 0, y: 0, width: 1, height: 0.5 };
    const stages: string[] = [];
    const rendered = await renderImage(filename, recipe, (stage) =>
      stages.push(stage),
    );
    assert.deepEqual(stages, [
      "read",
      "orientation",
      "straighten",
      "crop",
      "resize",
      "protection",
      "encode",
    ]);
    assert.equal(rendered.width, 64);
    assert.equal(rendered.height, 48);
    assert.deepEqual(await readFile(filename), original);
    const metadata = await sharp(rendered.bytes).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, rendered.width);
    assert.ok(
      !Buffer.from(rendered.bytes).includes(Buffer.from("PRIVATE-SOURCE-PATH")),
    );
    assert.ok(
      Buffer.from(rendered.bytes).includes(Buffer.from("Brandon J. Chen")),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("bundled libheif decodes a real HEVC fixture and AVIF is not misidentified as HEIC", async () => {
  const filename = path.resolve(
    "tools/portfolio-electron-shared/tests/fixtures/synthetic.heic",
  );
  assert.ok(isHeic(await readFile(filename)));
  const recipe = defaultRecipe();
  recipe.watermark.tiled = false;
  recipe.watermark.corner = false;
  const rendered = await renderImage(filename, recipe);
  assert.equal(rendered.width, 32);
  assert.equal(rendered.height, 24);
  const avif = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "red" },
  })
    .avif()
    .toBuffer();
  assert.equal(isHeic(avif), false);
});
test("exact preview bytes are reused for publication and stale recipes/originals are rejected", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "processor-preview-"));
  try {
    const filename = path.join(directory, "original.png");
    await sharp({
      create: { width: 100, height: 60, channels: 3, background: "blue" },
    })
      .png()
      .toFile(filename);
    const originals = new Map([["source-1", filename]]);
    const service = new ProcessingService(
      originals,
      directory,
      async (request) => {
        const command = request as { originalPath: string; recipe: unknown };
        return renderImage(command.originalPath, command.recipe);
      },
    );
    const recipe = defaultRecipe();
    const preview = await service.render("source-1", recipe, () => {});
    const publication = await service.publication(
      preview.token,
      "source-1",
      recipe,
    );
    assert.deepEqual(
      Buffer.from(preview.dataUrl.split(",")[1], "base64"),
      Buffer.from(publication.bytes),
    );
    await assert.rejects(
      service.publication(preview.token, "source-1", {
        ...recipe,
        quality: 80,
      }),
      /stale/,
    );
    await service.saveDefaults(recipe);
    assert.deepEqual(await service.defaults(), recipe);
    await writeFile(filename, "changed");
    await assert.rejects(
      service.publication(preview.token, "source-1", recipe),
      /changed/,
    );
    await assert.rejects(
      service.render("unknown", recipe, () => {}),
      /Import or relink/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("rejects malformed recipes and missing originals without producing output", async () => {
  const recipe = defaultRecipe();
  assert.throws(
    () =>
      validateRecipe({
        ...recipe,
        crop: { x: 0.8, y: 0, width: 0.5, height: 1 },
      }),
    /Crop/,
  );
  assert.throws(
    () => validateRecipe({ ...recipe, rotation: 34 }),
    /orientation/,
  );
  await assert.rejects(
    renderImage("/missing/photograph.jpg", recipe),
    /Relink/,
  );
});
test("private drafts survive restart and cancellation aborts the running worker", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "processor-draft-"));
  try {
    const filename = path.join(directory, "original.png");
    await writeFile(filename, "original");
    const sourceId = "12345678-1234-1234-1234-123456789abc";
    const service = new ProcessingService(
      new Map([[sourceId, filename]]),
      directory,
      (_request, _progress, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () =>
            reject(new Error("cancelled")),
          ),
        ),
    );
    const recipe = defaultRecipe();
    await service.saveDraft(sourceId, recipe);
    const restored = new ProcessingService(new Map(), directory, async () => {
      throw new Error("not needed");
    });
    assert.deepEqual((await restored.drafts())[0], {
      id: sourceId,
      name: "original.png",
      recipe,
      needsRelink: false,
    });
    const rendering = service.render(sourceId, recipe, () => {});
    service.cancel(sourceId);
    await assert.rejects(rendering, /cancelled/);
    await rm(filename);
    assert.equal((await restored.drafts())[0].needsRelink, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
