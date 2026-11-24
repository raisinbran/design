import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const executablePath = process.env.PACKAGED_APP_EXE;
const variant = process.env.PACKAGED_APP_VARIANT || "packaged";
if (!executablePath) throw new Error("PACKAGED_APP_EXE must identify a built executable");

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(scriptDirectory, "../..");
const temporary = mkdtempSync(path.join(os.tmpdir(), "portfolio-packaged-smoke-"));
const site = path.join(temporary, "site");
const profiles = path.join(temporary, "profiles");
const siteFiles = ["data", "js", "engineeringdesign.html", "creativedesign.html"];

// Keep every test in a disposable site and profile, never in an owner's checkout.
for (const entry of siteFiles) {
  cpSync(path.join(repository, entry), path.join(site, entry), { recursive: true });
}
mkdirSync(profiles);

async function launchOnce(name, profileName) {
  const profile = path.join(profiles, profileName);
  const appData = path.join(profile, "appdata");
  const localAppData = path.join(profile, "localappdata");
  const userData = path.join(profile, "user-data");
  const temp = path.join(profile, "temp");
  for (const directory of [appData, localAppData, userData, temp]) {
    mkdirSync(directory, { recursive: true });
  }
  writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ folder: site }));
  const environment = {
    ...process.env,
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    TEMP: temp,
    TMP: temp,
    ELECTRON_ENABLE_LOGGING: "1",
    ELECTRON_ENABLE_STACK_DUMPING: "1",
  };

  let application;
  let failure;
  console.log(`[${variant}] ${name}: ${executablePath}`);
  try {
    // Playwright normally disables Chromium sandboxing: explicitly keep it enabled.
    application = await electron.launch({
      executablePath,
      args: [`--user-data-dir=${userData}`],
      chromiumSandbox: true,
      timeout: 30000,
      env: environment,
    });
    const window = await application.firstWindow({ timeout: 15000 });
    await window.getByRole("button", { name: "Reload" }).waitFor({ timeout: 15000 });
    const state = await application.evaluate(({ app, BrowserWindow }) => {
      const renderer = BrowserWindow.getAllWindows()[0].webContents.getOSProcessId();
      return {
        executable: app.getPath("exe"),
        userData: app.getPath("userData"),
        sandboxed: app.getAppMetrics().find((metric) => metric.pid === renderer)?.sandboxed,
      };
    });
    const loaded = await window.evaluate(() => window.portfolio["portfolio.load"]());
    console.log(`[${variant}] ${name}: ${JSON.stringify(state)}`);
    if (state.sandboxed !== true) throw new Error("Renderer sandbox was not enabled");
    if (!loaded.ok || loaded.value?.folder !== site) {
      throw new Error("Packaged IPC did not load the synthetic site");
    }
  } catch (error) {
    failure = error;
    console.error(`[${variant}] ${name} failed:`, error);
  } finally {
    if (application) {
      const child = application.process();
      try {
        await application.close();
        console.log(`[${variant}] ${name}: exit=${child.exitCode} signal=${child.signalCode}`);
        if (child.exitCode !== 0) failure ??= new Error("App exited with a nonzero code");
      } catch (error) {
        failure ??= error;
        console.error(`[${variant}] ${name}: shutdown failed:`, error);
      }
    }
  }
  return !failure;
}

const scenarios = [
  ["initial launch", "persistent"],
  ["second launch", "persistent"],
  ["third launch", "persistent"],
  ["fresh-profile launch", "fresh"],
];
let failed = false;
try {
  for (const [name, profileName] of scenarios) {
    if (!(await launchOnce(name, profileName))) failed = true;
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
if (failed) process.exitCode = 1;
