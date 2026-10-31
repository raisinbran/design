import { cpSync, mkdtempSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
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
  return electron.launch({ chromiumSandbox: true, args: [packageDir, `--user-data-dir=${userData}`] });
}

describe("app launch", () => {
  it("app launches sandboxed and opens folder", async () => {
    const userData = mkdtempSync(path.join(os.tmpdir(), "portfolio-studio-user-"));
    const copy = mkdtempSync(path.join(os.tmpdir(), "portfolio-studio-repo-"));
    try {
      cpSync(repositoryDir, copy, { recursive: true, filter: (source) => !SKIPPED_IN_COPY.has(path.basename(source)) });
      writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ folder: copy }));

      const studio = await launch(userData);
      const page = await studio.firstWindow();
      await page.getByRole("heading", { name: "Settings" }).waitFor();
      const renderer = await studio.evaluate(({ app, BrowserWindow }) => {
        const pid = BrowserWindow.getAllWindows()[0].webContents.getOSProcessId();
        return { pid, sandboxed: app.getAppMetrics().find((metric) => metric.pid === pid)?.sandboxed };
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
      await studio.close();

      expect(rendererSandboxed).toBe(true);
      expect(globals).toEqual({ portfolio: "object", require: "undefined" });
      expect(opened).toEqual({ ok: true, value: { folder: copy } });
    } finally {
      rmSync(userData, { recursive: true, force: true });
      rmSync(copy, { recursive: true, force: true });
    }
  }, 60_000);
});
