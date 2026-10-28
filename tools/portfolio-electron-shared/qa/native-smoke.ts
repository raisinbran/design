import assert from "node:assert/strict";
import { _electron, type ElectronApplication } from "playwright";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fixture } from "../tests/workspace-fixture";
const require = createRequire(import.meta.url);
const { packagePaths } = require("./package-paths.cjs");

async function main() {
  const f = await fixture();
  const opened: ElectronApplication[] = [];
  const timings: Record<string, number> = {};
  const output =
    process.env.PORTFOLIO_QA_OUTPUT ||
    path.join(f.directory, "native-artifacts");
  await mkdir(output, { recursive: true });
  const processorPath = packagePaths(
    "photo-processor-electron",
    "Photo Processor",
  );
  async function launch(folder: string, name: string) {
    const start = performance.now();
    const packaged = packagePaths(folder, name);
    const application = await _electron.launch({
      executablePath: packaged.executable,
      args:
        process.platform === "linux" ? ["--no-sandbox", "--disable-gpu"] : [],
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] =>
              entry[1] !== undefined && entry[0] !== "ELECTRON_RUN_AS_NODE",
          ),
        ),
        PORTFOLIO_DATA_DIRECTORY: path.join(f.directory, "native-data"),
        XDG_CACHE_HOME: path.join(f.directory, "cache"),
      },
      timeout: 30000,
    });
    opened.push(application);
    const page = await application.firstWindow();
    await page.waitForFunction(() => !!window.portfolio);
    timings[`${name}ReadyMs`] = performance.now() - start;
    assert.equal(
      await page.evaluate(
        () => typeof (window as unknown as { require?: unknown }).require,
      ),
      "undefined",
    );
    await application.evaluate(
      ({ dialog }, values) => {
        // Drive native chooser results in the test process; renderer privileges remain unchanged.
        dialog.showOpenDialog = (async (...args: unknown[]) => {
          const options = args.at(-1) as { title?: string };
          const title = options.title || "";
          return {
            canceled: false,
            filePaths: [
              title.includes("Locate")
                ? values.processor
                : title.includes("Original")
                  ? values.original
                  : values.root,
            ],
          };
        }) as typeof dialog.showOpenDialog;
      },
      {
        processor: processorPath.executable,
        root: f.root,
        original: f.original,
      },
    );
    return { application, page };
  }
  try {
    // Each package launches with its companion closed and reads the portfolio independently.
    const independent = await launch(
      "photo-processor-electron",
      "Photo Processor",
    );
    const processorWorkspace = await independent.page.evaluate(() =>
      window.portfolio.chooseWorkspace(),
    );
    assert.ok(processorWorkspace);
    await independent.application.close();
    opened.splice(opened.indexOf(independent.application), 1);
    const studio = await launch(
      "portfolio-studio-electron",
      "Portfolio Studio",
    );
    const workspace = await studio.page.evaluate(() =>
      window.portfolio.chooseWorkspace(),
    );
    assert.ok(workspace);
    await studio.page
      .getByRole("button", { name: "Open Portfolio", exact: true })
      .click();
    assert.equal(
      (
        await studio.page.evaluate(() =>
          window.portfolio.getCompanionSettings(),
        )
      ).enabled,
      false,
    );
    const processor = await launch(
      "photo-processor-electron",
      "Photo Processor",
    );
    await studio.page.evaluate(() => window.portfolio.locateCompanion());
    const taskId = await studio.page.evaluate(
      (id) => window.portfolio.launchCompanion(id, "import"),
      workspace.id,
    );
    await processor.page.waitForFunction(
      (id) =>
        window.portfolio
          .getCompanionTasks()
          .then((tasks) => tasks.some((task) => task.id === id)),
      taskId,
    );
    const sources = await processor.page.evaluate(() =>
      window.portfolio.chooseOriginals(),
    );
    assert.equal(sources.length, 1);
    const recipe = (
      await import("../src/renderer/editor-state")
    ).defaultRecipe();
    const preview = await processor.page.evaluate(
      (values) => window.portfolio.renderPreview(values.id, values.recipe),
      { id: sources[0].id, recipe },
    );
    const result = await processor.page.evaluate(
      (values) => window.portfolio.publishPhoto(values),
      {
        workspaceId: workspace.id,
        revision: workspace.revision,
        sourceId: sources[0].id,
        token: preview.token,
        recipe,
        alt: "Native packaged smoke publication",
        taskId,
      },
    );
    assert.equal(result.skipped, false);
    const refreshed = await studio.page.evaluate(
      (id) => window.portfolio.refreshWorkspace(id),
      workspace.id,
    );
    assert.equal(
      refreshed.catalogs.photography.photos.length,
      workspace.catalogs.photography.photos.length + 1,
    );
    assert.equal(
      (
        await processor.page.evaluate(() =>
          window.portfolio.getCompanionTasks(),
        )
      ).length,
      0,
    );
    await studio.page.screenshot({
      path: path.join(output, "native-studio.png"),
    });
    await processor.page.screenshot({
      path: path.join(output, "native-processor.png"),
    });
    await writeFile(
      path.join(output, "native-metrics.json"),
      JSON.stringify(
        { platform: process.platform, arch: process.arch, ...timings },
        null,
        2,
      ),
    );
    console.log(
      "Native packaged independent launches, sandboxed preload, linked delivery, rendering, publication, receipt, and Studio refresh passed.",
      timings,
    );
  } finally {
    for (const application of opened.reverse())
      await application.close().catch(() => {});
    await rm(f.directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
