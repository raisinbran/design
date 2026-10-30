import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from "electron";
import squirrelStartup from "electron-squirrel-startup";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import type { Page, PortfolioApi, PortfolioView, Result } from "./api/api";
import { photoHandlers, previewResponse } from "./imaging/photos";
import { METHODS } from "./ipc";
import { readSettings, writeSettings } from "./settings";
import { resolveSiteImage } from "./storage/images";
import { loadPortfolio, savePortfolio } from "./storage/portfolio";
import { openRememberedWindow } from "./window";

const PRELOAD = path.join(__dirname, "preload.cjs");
let mainWindow: BrowserWindow | null = null;

const PAGE_FILES: Record<Page, string> = {
  photography: "photography.html",
  engineering: "engineeringdesign.html",
  archive: "creativedesign.html",
};

const ok = <T>(value: T): Result<T> => ({ ok: true, value });

const isFolder = (folder: string | null): folder is string =>
  !!folder && existsSync(folder) && statSync(folder).isDirectory();

async function loadView(folder: string | null): Promise<PortfolioView | null> {
  return isFolder(folder) ? loadPortfolio(folder) : null;
}

function openFolder(): string {
  const { folder } = readSettings();
  if (!isFolder(folder)) throw new Error("Choose the website folder in Settings first");
  return folder;
}

const handlers: PortfolioApi = {
  async "portfolio.load"() {
    return ok(await loadView(readSettings().folder));
  },
  async "portfolio.choose"() {
    const choice = await dialog.showOpenDialog(mainWindow!, { properties: ["openDirectory"] });
    if (choice.canceled) return ok(null);
    const folder = choice.filePaths[0];
    writeSettings({ ...readSettings(), folder });
    return ok(await loadView(folder));
  },
  async "catalogs.save"(revision, catalogs) {
    return savePortfolio(openFolder(), revision, catalogs);
  },
  async "site.open"(page) {
    await shell.openExternal(pathToFileURL(path.join(openFolder(), PAGE_FILES[page])).href);
    return ok(null);
  },
  async "settings.get"() {
    return ok(readSettings());
  },
  async "settings.set"({ rights, watermark }) {
    writeSettings({ ...readSettings(), rights, watermark });
    return ok(readSettings());
  },
  ...photoHandlers(() => mainWindow, openFolder),
  async "app.info"() {
    return ok({
      app: app.getVersion(),
      electron: process.versions.electron,
      sharp: sharp.versions.sharp ?? "unknown",
      libvips: sharp.versions.vips,
    });
  },
};

function serveApi(): void {
  for (const method of METHODS) {
    ipcMain.handle(method, async (event, ...args: unknown[]): Promise<Result<unknown>> => {
      // Only the app's own top-level page may call the backend.
      if (!mainWindow || event.senderFrame !== mainWindow.webContents.mainFrame) {
        return {
          ok: false,
          error: { code: "internal", message: `Refused ${method}: not from the app window` },
        };
      }
      try {
        const handler = handlers[method] as (...args: unknown[]) => Promise<Result<unknown>>;
        return await handler(...args);
      } catch (error) {
        return { ok: false, error: { code: "internal", message: String(error) } };
      }
    });
  }
}

function serveImages(): void {
  protocol.handle("portfolio", async (request) => {
    const url = new URL(request.url);
    if (url.host === "preview") return previewResponse(url);
    const { folder } = readSettings();
    const file = folder ? await resolveSiteImage(folder, request.url) : null;
    return file ? net.fetch(pathToFileURL(file).href) : new Response("Not found", { status: 404 });
  });
}

function openMainWindow(): void {
  if (!existsSync(PRELOAD)) {
    dialog.showErrorBox(
      "Portfolio Studio cannot start",
      `The preload script is missing: ${PRELOAD}`,
    );
    app.quit();
    return;
  }
  mainWindow = openRememberedWindow({
    title: "Portfolio Studio",
    webPreferences: {
      preload: PRELOAD,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.on("closed", () => (mainWindow = null));
  // The page cancels unloading while it has unsaved edits; preventDefault here closes anyway.
  mainWindow.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow!, {
      type: "question",
      buttons: ["Keep Editing", "Discard and Close"],
      defaultId: 0,
      cancelId: 0,
      message: "Discard unsaved edits and close?",
    });
    if (choice === 1) event.preventDefault();
  });
  void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}

// During a Windows install or uninstall, electron-squirrel-startup updates the shortcuts and the app must quit.
if (squirrelStartup) {
  app.quit();
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.enableSandbox();
  protocol.registerSchemesAsPrivileged([
    { scheme: "portfolio", privileges: { standard: true, secure: true } },
  ]);
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-navigate", (navigation) => navigation.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
  });
  app.on("second-instance", () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  app.on("window-all-closed", () => app.quit());
  void app.whenReady().then(() => {
    serveApi();
    serveImages();
    openMainWindow();
  });
}
