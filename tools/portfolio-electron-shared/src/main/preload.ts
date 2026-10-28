import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "../contracts";
export function installBridge(): void {
  const appId = process.argv.includes("--portfolio-app=photo-processor")
    ? "photo-processor"
    : "portfolio-studio";
  const bridge: DesktopBridge = {
    version: 1,
    appId,
    chooseWorkspace: () => ipcRenderer.invoke("portfolio:choose-workspace"),
    refreshWorkspace: (id) =>
      ipcRenderer.invoke("portfolio:refresh-workspace", id),
    readWorkspaceImage: (id, relative) =>
      ipcRenderer.invoke("portfolio:read-workspace-image", id, relative),
    chooseOriginals: () => ipcRenderer.invoke("portfolio:choose-originals"),
    getAppearance: () => ipcRenderer.invoke("portfolio:get-appearance"),
    setTheme: (theme) => ipcRenderer.invoke("portfolio:set-theme", theme),
    imageCapabilities: () => ipcRenderer.invoke("portfolio:image-capabilities"),
    renderPreview: (id, recipe) =>
      ipcRenderer.invoke("portfolio:render-preview", id, recipe),
    cancelProcessing: (id) =>
      ipcRenderer.invoke("portfolio:cancel-processing", id),
    saveProcessingDraft: (id, recipe) =>
      ipcRenderer.invoke("portfolio:save-processing-draft", id, recipe),
    getProcessingDrafts: () =>
      ipcRenderer.invoke("portfolio:processing-drafts"),
    getProcessingDefaults: () =>
      ipcRenderer.invoke("portfolio:processing-defaults"),
    setProcessingDefaults: (recipe) =>
      ipcRenderer.invoke("portfolio:set-processing-defaults", recipe),
    onProcessingProgress: (listener) => {
      const receive = (
        _event: Electron.IpcRendererEvent,
        progress: Parameters<typeof listener>[0],
      ) => listener(progress);
      ipcRenderer.on("portfolio:processing-progress", receive);
      return () =>
        ipcRenderer.removeListener("portfolio:processing-progress", receive);
    },
    getCompanionSettings: () =>
      ipcRenderer.invoke("portfolio:companion-settings"),
    locateCompanion: () => ipcRenderer.invoke("portfolio:locate-companion"),
    setCompanionEnabled: (enabled) =>
      ipcRenderer.invoke("portfolio:companion-enabled", enabled),
    launchCompanion: (id, operation, photoKey) =>
      ipcRenderer.invoke("portfolio:launch-companion", id, operation, photoKey),
    getCompanionTasks: () => ipcRenderer.invoke("portfolio:companion-tasks"),
    getCompanionSource: (id) =>
      ipcRenderer.invoke("portfolio:companion-source", id),
    completeCompanionTask: (id) =>
      ipcRenderer.invoke("portfolio:complete-companion-task", id),
    reconcileWorkspace: (id, revision, catalogs) =>
      ipcRenderer.invoke(
        "portfolio:reconcile-workspace",
        id,
        revision,
        catalogs,
      ),
    saveLocally: (id, revision, catalogs) =>
      ipcRenderer.invoke("portfolio:save-locally", id, revision, catalogs),
    publishPhoto: (request) =>
      ipcRenderer.invoke("portfolio:publish-photo", request),
    getRecovery: (id) => ipcRenderer.invoke("portfolio:recovery", id),
    recoverSave: (id, transactionId) =>
      ipcRenderer.invoke("portfolio:recover-save", id, transactionId),
    previewWebsite: (id, page) =>
      ipcRenderer.invoke("portfolio:preview-website", id, page),
    reviewMigration: (id) =>
      ipcRenderer.invoke("portfolio:review-migration", id),
    migratePhotos: (id, revision, keys, cleanup) =>
      ipcRenderer.invoke(
        "portfolio:migrate-photos",
        id,
        revision,
        keys,
        cleanup,
      ),
    onCompanionTask: (listener) => {
      const receive = (
        _event: Electron.IpcRendererEvent,
        task: Parameters<typeof listener>[0],
      ) => listener(task);
      ipcRenderer.on("portfolio:companion-task", receive);
      return () =>
        ipcRenderer.removeListener("portfolio:companion-task", receive);
    },
    onWorkspaceChanged: (listener) => {
      const receive = (_event: Electron.IpcRendererEvent, id: string) =>
        listener(id);
      ipcRenderer.on("portfolio:workspace-changed", receive);
      return () =>
        ipcRenderer.removeListener("portfolio:workspace-changed", receive);
    },
  };
  contextBridge.exposeInMainWorld("portfolio", Object.freeze(bridge));
}
