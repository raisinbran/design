import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from "electron";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type { AppDefinition } from "../models";
import type { ImageCapabilities, SourceSelection } from "../contracts";
import { readWorkspaceImage } from "./assets";
import { AppearanceStore } from "./appearance";
import { WorkspaceRegistry } from "./files";
import { access } from "node:fs/promises";
import { CompanionService } from "./companion";
import { PrivateSourceStore } from "./private-sources";
import { WorkspaceWriter } from "./workspace-lock";
import { ProcessingService } from "./processing";
import { reconcile } from "./reconcile";
import { validateCatalogs } from "../validation";
import { Transactions } from "./transactions";
import {
  PublicationService,
  PublicationConflict,
  type PublishRequest,
} from "./publication";
import { LegacyMigration } from "./migration";
import { SitePreview } from "./site-preview";
import { handleWindowsInstaller } from "./windows-install";
import type { ProcessingStage } from "../processing/render-image";
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
export interface DesktopServices {
  workspaces: WorkspaceRegistry;
  originals: Map<string, string>;
  privateDirectory: string;
  writer?: WorkspaceWriter;
  sources?: PrivateSourceStore;
  companion?: CompanionService;
  processing?: ProcessingService;
}
export function runImageWorker<T>(
  request: unknown,
  progress: (stage: ProcessingStage) => void = () => {},
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "image-worker.js"), {
      workerData: request,
    });
    let answered = false;
    const cancel = () => {
      void worker.terminate();
      reject(new Error("Processing cancelled"));
    };
    signal?.addEventListener("abort", cancel, { once: true });
    worker.on(
      "message",
      (result: {
        progress?: ProcessingStage;
        ok?: boolean;
        value: T;
        error?: string;
      }) => {
        if (result.progress) {
          progress(result.progress);
          return;
        }
        answered = true;
        signal?.removeEventListener("abort", cancel);
        if (result.ok) resolve(result.value);
        else reject(new Error(result.error || "Image worker failed"));
      },
    );
    worker.once("error", reject);
    worker.once("exit", (code) => {
      signal?.removeEventListener("abort", cancel);
      if (!answered)
        reject(new Error(`Image worker exited before responding (${code})`));
    });
    if (signal?.aborted) cancel();
  });
}
export function startDesktop(definition: AppDefinition): void {
  if (handleWindowsInstaller(() => app.quit())) return;
  const dataDirectory = process.env.PORTFOLIO_DATA_DIRECTORY;
  if (dataDirectory) {
    if (!path.isAbsolute(dataDirectory))
      throw new Error(
        "PORTFOLIO_DATA_DIRECTORY must be an absolute private directory",
      );
    mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
    app.setPath("appData", dataDirectory);
  }
  app.setName(definition.name);
  // One rendezvous endpoint per app; the independently launched companion has its own lock.
  const userData = path.join(
    app.getPath("appData"),
    "Portfolio Tools",
    definition.id,
  );
  mkdirSync(userData, { recursive: true, mode: 0o700 });
  app.setPath("userData", userData);
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  const services: DesktopServices = {
    workspaces: new WorkspaceRegistry(),
    originals: new Map(),
    privateDirectory: path.join(app.getPath("appData"), "Portfolio Tools"),
  };
  let window: BrowserWindow | null = null;
  app.on("second-instance", () => {
    window?.restore();
    window?.focus();
  });
  const appearance = new AppearanceStore(
    path.join(services.privateDirectory, definition.id),
  );
  app
    .whenReady()
    .then(async () => {
      nativeTheme.themeSource = (await appearance.read()).theme;
      services.writer = new WorkspaceWriter(
        services.privateDirectory,
        services.workspaces,
        definition.id,
      );
      services.sources = new PrivateSourceStore(services.privateDirectory);
      services.companion = new CompanionService(
        services.privateDirectory,
        definition.id,
        services.workspaces,
        (task) => {
          window?.webContents.send("portfolio:companion-task", task);
          window?.show();
          window?.focus();
        },
        (id) => window?.webContents.send("portfolio:workspace-changed", id),
      );
      // Optional linking must never prevent either app from launching independently.
      let companionFailure = "";
      try {
        await services.companion.start();
      } catch (error) {
        companionFailure = `Companion linking unavailable: ${String(error)}`;
      }
      services.processing = new ProcessingService(
        services.originals,
        services.privateDirectory,
        (request, report, signal) => runImageWorker(request, report, signal),
      );
      app.on("will-quit", () => {
        void services.companion?.stop();
      });
      const transactions = new Transactions(
        services.privateDirectory,
        services.workspaces,
        services.writer!,
      );
      const publication = new PublicationService(
        services.privateDirectory,
        services.workspaces,
        transactions,
        services.processing!,
      );
      const migration = new LegacyMigration(
        services.privateDirectory,
        services.workspaces,
        transactions,
        services.originals,
      );
      const sitePreview = new SitePreview();
      app.on("will-quit", () => {
        void sitePreview.stop();
      });
      const createWindow = () => {
        window = new BrowserWindow({
          width: 1360,
          height: 900,
          minWidth: 850,
          minHeight: 600,
          show: false,
          title: definition.name,
          backgroundColor: nativeTheme.shouldUseDarkColors
            ? "#1e1f22"
            : "#f3f4f5",
          webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            additionalArguments: [`--portfolio-app=${definition.id}`],
          },
        });
        window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        window.webContents.on("will-navigate", (event) =>
          event.preventDefault(),
        );
        window.webContents.on("will-prevent-unload", (event) => {
          const choice = dialog.showMessageBoxSync(window!, {
            type: "question",
            buttons: ["Keep Editing", "Discard and Close"],
            defaultId: 0,
            cancelId: 0,
            title: "Unsaved Changes",
            message: "Discard unsaved edits and leave this window?",
            detail:
              "Staged catalog edits and unprocessed queue changes have not been saved.",
          });
          // Electron reverses this event: preventDefault permits the requested navigation/close.
          if (choice === 1) event.preventDefault();
        });
        window.once("ready-to-show", () => window?.show());
        const updateChrome = () =>
          window?.setBackgroundColor(
            nativeTheme.shouldUseDarkColors ? "#1e1f22" : "#f3f4f5",
          );
        nativeTheme.on("updated", updateChrome);
        window.once("closed", () =>
          nativeTheme.removeListener("updated", updateChrome),
        );
        window.on("closed", () => {
          window = null;
        });
        if (
          typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== "undefined" &&
          MAIN_WINDOW_VITE_DEV_SERVER_URL
        ) {
          void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
        } else {
          const name =
            typeof MAIN_WINDOW_VITE_NAME === "undefined"
              ? "main_window"
              : MAIN_WINDOW_VITE_NAME;
          void window.loadFile(
            path.join(__dirname, `../renderer/${name}/index.html`),
          );
        }
      };
      // Every operation must originate in this application's trusted top-level renderer.
      const handle = (
        channel: string,
        action: (...args: unknown[]) => unknown,
      ) => {
        ipcMain.handle(channel, (event, ...args: unknown[]) => {
          if (
            !window ||
            event.sender !== window.webContents ||
            event.senderFrame !== window.webContents.mainFrame
          )
            throw new Error("Untrusted IPC sender");
          return action(...args);
        });
      };
      handle("portfolio:choose-workspace", async () => {
        const selection = await dialog.showOpenDialog(window!, {
          title: "Choose Portfolio Folder",
          properties: ["openDirectory"],
        });
        return selection.canceled
          ? null
          : services.workspaces.select(selection.filePaths[0]);
      });
      handle("portfolio:refresh-workspace", (id) =>
        services.workspaces.read(String(id)),
      );
      handle("portfolio:read-workspace-image", (id, relative) =>
        readWorkspaceImage(services.workspaces, String(id), relative),
      );
      handle("portfolio:choose-originals", async () => {
        if (!definition.ownsPixelProcessing)
          throw new Error("Open Photo Processor to edit photographs");
        const selection = await dialog.showOpenDialog(window!, {
          title: "Import Originals",
          properties: ["openFile", "multiSelections"],
          filters: [
            {
              name: "Photographs",
              extensions: [
                "jpg",
                "jpeg",
                "png",
                "webp",
                "tif",
                "tiff",
                "heic",
                "heif",
                "avif",
              ],
            },
          ],
        });
        if (selection.canceled) return [];
        return selection.filePaths.map((filename) => {
          const id = randomUUID();
          services.originals.set(id, filename);
          return {
            id,
            name: path.basename(filename),
          } satisfies SourceSelection;
        });
      });
      handle("portfolio:get-appearance", () => appearance.read());
      handle("portfolio:set-theme", async (theme) => {
        const settings = await appearance.set(theme);
        nativeTheme.themeSource = settings.theme;
        return settings;
      });
      const requireProcessor = () => {
        if (!definition.ownsPixelProcessing)
          throw new Error("Open Photo Processor to edit photographs");
      };
      handle("portfolio:render-preview", (id, recipe) => {
        requireProcessor();
        return services.processing!.render(String(id), recipe, (stage) =>
          window?.webContents.send("portfolio:processing-progress", {
            sourceId: id,
            stage,
          }),
        );
      });
      handle("portfolio:cancel-processing", (id) => {
        requireProcessor();
        services.processing!.cancel(String(id));
      });
      handle("portfolio:save-processing-draft", (id, recipe) => {
        requireProcessor();
        return services.processing!.saveDraft(String(id), recipe);
      });
      handle("portfolio:processing-drafts", () => {
        requireProcessor();
        return services.processing!.drafts();
      });
      handle("portfolio:processing-defaults", () =>
        services.processing!.defaults(),
      );
      handle("portfolio:set-processing-defaults", (recipe) => {
        requireProcessor();
        return services.processing!.saveDefaults(recipe);
      });
      handle("portfolio:image-capabilities", () =>
        runImageWorker<ImageCapabilities>({ action: "capabilities" }),
      );
      handle("portfolio:companion-settings", () =>
        services.companion!.settings(),
      );
      handle("portfolio:locate-companion", async () => {
        if (definition.id !== "portfolio-studio")
          throw new Error("Companion linking is configured in Studio");
        const selection = await dialog.showOpenDialog(window!, {
          title: "Locate Installed Photo Processor",
          properties: ["openFile"],
          filters:
            process.platform === "darwin"
              ? [{ name: "Application", extensions: ["app"] }]
              : process.platform === "win32"
                ? [{ name: "Application", extensions: ["exe"] }]
                : undefined,
        });
        return selection.canceled
          ? services.companion!.settings()
          : services.companion!.configure(selection.filePaths[0], true);
      });
      handle("portfolio:companion-enabled", (enabled) => {
        if (
          definition.id !== "portfolio-studio" ||
          typeof enabled !== "boolean"
        )
          throw new Error("Invalid companion preference");
        return services.companion!.configure(null, enabled);
      });
      handle("portfolio:launch-companion", (id, operation, photoKey) => {
        if (companionFailure)
          throw new Error(
            companionFailure + ". Open Photo Processor independently.",
          );
        return services.companion!.launch(String(id), operation, photoKey);
      });
      handle("portfolio:companion-tasks", () =>
        services.companion!.currentTasks(),
      );
      handle("portfolio:companion-source", async (id) => {
        const task = services
          .companion!.currentTasks()
          .find((task) => task.id === id);
        if (!task || task.operation !== "reframe" || !task.photoKey)
          throw new Error("Select a framing task first");
        const saved = await services.sources!.read(
          task.workspace.id,
          task.photoKey,
        );
        if (!saved) return { source: null, recipe: null, needsRelink: true };
        try {
          await access(saved.originalPath);
        } catch {
          return { source: null, recipe: saved.recipe, needsRelink: true };
        }
        const sourceId = randomUUID();
        services.originals.set(sourceId, saved.originalPath);
        return {
          source: { id: sourceId, name: path.basename(saved.originalPath) },
          recipe: saved.recipe,
          needsRelink: false,
        };
      });
      handle("portfolio:complete-companion-task", (id) =>
        services.companion!.complete(String(id)),
      );
      handle(
        "portfolio:reconcile-workspace",
        async (id, revision, catalogs) => {
          const baseline = services.workspaces.baselineCatalogs(
            String(id),
            String(revision),
          );
          const workspace = await services.workspaces.read(String(id));
          return {
            workspace,
            catalogs: validateCatalogs(
              reconcile(
                baseline,
                validateCatalogs(catalogs),
                workspace.catalogs,
              ),
            ),
          };
        },
      );
      handle("portfolio:save-locally", (id, revision, catalogs) => {
        if (definition.ownsPixelProcessing)
          throw new Error("Use Studio to save management edits");
        return publication.save(String(id), String(revision), catalogs);
      });
      handle("portfolio:publish-photo", async (value) => {
        if (
          !definition.ownsPixelProcessing ||
          !value ||
          typeof value !== "object"
        )
          throw new Error("Use Photo Processor to publish images");
        const request = value as PublishRequest & { taskId?: string };
        if (request.taskId) {
          const task = services
            .companion!.currentTasks()
            .find((task) => task.id === request.taskId);
          if (
            !task ||
            task.workspace.id !== request.workspaceId ||
            (task.operation === "reframe" && task.photoKey !== request.photoKey)
          )
            throw new Error(
              "The publication does not match the companion task",
            );
        }
        let result;
        try {
          result = await publication.publish(request);
        } catch (error) {
          if (!(error instanceof PublicationConflict)) throw error;
          const choice = await dialog.showMessageBox(window!, {
            type: "warning",
            title: "Publication Conflict",
            message: error.message,
            detail:
              "Overwrite replaces the existing catalog image. Rename creates a unique name. Skip leaves it unchanged.",
            buttons: ["Skip", "Rename", "Overwrite"],
            defaultId: 0,
            cancelId: 0,
          });
          result = await publication.publish({
            ...request,
            conflict: (["skip", "rename", "overwrite"] as const)[
              choice.response
            ],
          });
        }
        let notification: string | undefined;
        if (!result.skipped && request.taskId) {
          services.companion!.recordPublication(
            request.taskId,
            result.photoKey,
            result.workspace.revision,
          );
          try {
            await services.companion!.complete(request.taskId);
          } catch {
            notification =
              "Saved locally. Studio is unavailable; refresh its catalog when you open it.";
          }
        }
        return { ...result, notification };
      });
      handle("portfolio:recovery", async (id) => ({
        items: await transactions.list(String(id)),
        locked: !!(await services.writer!.owner(String(id))),
      }));
      handle("portfolio:recover-save", async (id, transactionId) => {
        const workspaceId = String(id);
        const choice = await dialog.showMessageBox(window!, {
          type: "warning",
          title: "Restore Local Backup",
          message: transactionId
            ? "Restore the files from before this save?"
            : "Recover the stale writer lock?",
          detail:
            "Recovery refuses running writers and files changed outside the recorded transaction.",
          buttons: ["Cancel", "Recover"],
          defaultId: 0,
          cancelId: 0,
        });
        if (choice.response !== 1) return services.workspaces.read(workspaceId);
        if (transactionId === null) {
          if (await transactions.pending(workspaceId))
            throw new Error(
              "Recover the interrupted transaction before clearing its lock.",
            );
          await services.writer!.recover(workspaceId, async () => {});
        } else await transactions.recover(workspaceId, String(transactionId));
        return services.workspaces.read(workspaceId);
      });
      handle("portfolio:preview-website", async (id, page) => {
        const url = await sitePreview.start(
          services.workspaces.root(String(id)),
          String(page),
        );
        const previewWindow = new BrowserWindow({
          width: 1280,
          height: 900,
          title: "Local Website Preview",
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
          },
        });
        previewWindow.webContents.setWindowOpenHandler(() => ({
          action: "deny",
        }));
        previewWindow.webContents.on("will-navigate", (event, destination) => {
          if (!destination.startsWith(new URL(url).origin + "/"))
            event.preventDefault();
        });
        await previewWindow.loadURL(url);
      });
      handle("portfolio:review-migration", (id) =>
        migration.review(String(id)),
      );
      handle(
        "portfolio:migrate-photos",
        async (id, revision, keys, cleanup) => {
          if (
            !Array.isArray(keys) ||
            !keys.length ||
            keys.some((key) => typeof key !== "string") ||
            typeof cleanup !== "boolean"
          )
            throw new Error("Select photographs to review");
          const choice = await dialog.showMessageBox(window!, {
            type: "warning",
            title: cleanup
              ? "Reviewed Full-Size Cleanup"
              : "Migrate to Single Published Images",
            message: cleanup
              ? `Remove ${keys.length} reviewed full-size files with private recovery backups?`
              : `Mark ${keys.length} photos as single-image publications and retain their full-size files?`,
            detail:
              "Files with remaining references or saved-original use cannot be cleaned up. GitHub Desktop remains your commit and push step.",
            buttons: ["Cancel", "Apply Locally"],
            defaultId: 0,
            cancelId: 0,
          });
          if (choice.response === 1) {
            if (cleanup)
              await migration.cleanup(String(id), String(revision), keys);
            else await migration.migrate(String(id), String(revision), keys);
          }
          return services.workspaces.read(String(id));
        },
      );
      createWindow();
      app.on("activate", () => {
        if (!window) createWindow();
      });
    })
    .catch((error) => {
      dialog.showErrorBox(`${definition.name} could not start`, String(error));
      app.quit();
    });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

