import { cpSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright";
import { describe, expect, it } from "vitest";

// Runs the app that `npm test` builds, with a fresh user data folder so the owner's settings stay untouched.
const packageDir = path.resolve(import.meta.dirname, "..");
const repositoryDir = path.resolve(packageDir, "..");
const SKIPPED_IN_COPY = new Set([".git", "node_modules", "worktrees", ".vite", "out"]);

function launch(userData: string) {
  // Without chromiumSandbox, Playwright turns the sandbox off on Linux.
  return electron.launch({
    chromiumSandbox: true,
    args: [packageDir, `--user-data-dir=${userData}`],
  });
}

describe("app launch", () => {
  it("app launches sandboxed and saves", async () => {
    const userData = mkdtempSync(path.join(os.tmpdir(), "portfolio-studio-user-"));
    const copy = mkdtempSync(path.join(os.tmpdir(), "portfolio-studio-repo-"));
    try {
      cpSync(repositoryDir, copy, {
        recursive: true,
        filter: (source) => !SKIPPED_IN_COPY.has(path.basename(source)),
      });
      writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ folder: copy }));
      const read = (file: string) => readFileSync(path.join(copy, file), "utf8");
      // The first photo is DSCF3655_crop.jpg, described as "mountains".
      const expected = Object.fromEntries(
        ["data/media-catalog.json", "js/photography-catalog.js"].map((file) => [
          file,
          read(file).replace('"alt": "mountains"', '"alt": "snowy mountains"'),
        ]),
      );

      const studio = await launch(userData);
      const page = await studio.firstWindow();
      await page.getByRole("button", { name: "Reload" }).waitFor();
      const renderer = await studio.evaluate(({ app, BrowserWindow }) => {
        const pid = BrowserWindow.getAllWindows()[0].webContents.getOSProcessId();
        return {
          pid,
          sandboxed: app.getAppMetrics().find((metric) => metric.pid === pid)?.sandboxed,
        };
      });
      // Electron reports OS sandboxing only on macOS and Windows. On Linux, a sandboxed renderer runs in its own PID namespace.
      const rendererSandboxed =
        process.platform === "linux"
          ? readlinkSync(`/proc/${renderer.pid}/ns/pid`) !== readlinkSync("/proc/self/ns/pid")
          : renderer.sandboxed;
      const globals = await page.evaluate(() => ({
        portfolio: typeof window.portfolio,
        require: typeof (window as { require?: unknown }).require,
      }));
      const opened = await page.evaluate(() => window.portfolio["portfolio.load"]());
      await page.getByLabel("Description", { exact: true }).fill("snowy mountains");
      await page.getByRole("button", { name: "Save" }).click();
      // The script is replaced after the catalog, so once it changes the save is done.
      await expect
        .poll(() => read("js/photography-catalog.js"), { timeout: 10_000 })
        .toBe(expected["js/photography-catalog.js"]);
      await studio.close();

      expect(rendererSandboxed).toBe(true);
      expect(globals).toEqual({ portfolio: "object", require: "undefined" });
      expect(opened).toMatchObject({ ok: true, value: { folder: copy } });
      expect(read("data/media-catalog.json")).toBe(expected["data/media-catalog.json"]);
    } finally {
      rmSync(userData, { recursive: true, force: true });
      rmSync(copy, { recursive: true, force: true });
    }
  }, 60_000);
});
