import type { AppId, ThemePreference, WorkspaceCatalogs } from "./models";
export const CONTRACT_VERSION = 1 as const;
export interface WorkspaceView {
  id: string;
  name: string;
  catalogs: WorkspaceCatalogs;
  revision: string;
}
export interface AppearanceSettings {
  theme: ThemePreference;
}
export interface ImageCapabilities {
  formats: string[];
  heic: boolean;
  runtime: string;
}
export interface CompanionSettings {
  enabled: boolean;
  available: boolean;
  name: string | null;
}
export interface CompanionTask {
  version: 1;
  id: string;
  workspace: WorkspaceView;
  operation: "import" | "reframe";
  photoKey?: string;
}
export interface CompanionSource {
  source: SourceSelection | null;
  recipe: import("./models").EditRecipe | null;
  needsRelink: boolean;
}
export interface SourceSelection {
  id: string;
  name: string;
}
export interface RenderPreview {
  token: string;
  sourceId: string;
  recipeDigest: string;
  width: number;
  height: number;
  format: import("./models").EditRecipe["format"];
  byteLength: number;
  dataUrl: string;
}
export interface ProcessingDraft extends SourceSelection {
  recipe: import("./models").EditRecipe;
  needsRelink: boolean;
}
/** The renderer can request named actions only. It never receives arbitrary filesystem access. */
export interface DesktopBridge {
  version: 1;
  appId: AppId;
  chooseWorkspace(): Promise<WorkspaceView | null>;
  refreshWorkspace(workspaceId: string): Promise<WorkspaceView>;
  readWorkspaceImage(workspaceId: string, relative: string): Promise<string>;
  chooseOriginals(): Promise<SourceSelection[]>;
  getAppearance(): Promise<AppearanceSettings>;
  setTheme(theme: ThemePreference): Promise<AppearanceSettings>;
  imageCapabilities(): Promise<ImageCapabilities>;
  renderPreview(
    sourceId: string,
    recipe: import("./models").EditRecipe,
  ): Promise<RenderPreview>;
  cancelProcessing(sourceId: string): Promise<void>;
  saveProcessingDraft(
    sourceId: string,
    recipe: import("./models").EditRecipe,
  ): Promise<void>;
  getProcessingDrafts(): Promise<ProcessingDraft[]>;
  getProcessingDefaults(): Promise<import("./models").EditRecipe | null>;
  setProcessingDefaults(
    recipe: import("./models").EditRecipe,
  ): Promise<import("./models").EditRecipe>;
  onProcessingProgress(
    listener: (progress: { sourceId: string; stage: string }) => void,
  ): () => void;
  getCompanionSettings(): Promise<CompanionSettings>;
  locateCompanion(): Promise<CompanionSettings>;
  setCompanionEnabled(enabled: boolean): Promise<CompanionSettings>;
  launchCompanion(
    workspaceId: string,
    operation: "import" | "reframe",
    photoKey?: string,
  ): Promise<string>;
  getCompanionTasks(): Promise<CompanionTask[]>;
  getCompanionSource(taskId: string): Promise<CompanionSource>;
  completeCompanionTask(taskId: string): Promise<void>;
  reconcileWorkspace(
    workspaceId: string,
    revision: string,
    catalogs: WorkspaceCatalogs,
  ): Promise<{ workspace: WorkspaceView; catalogs: WorkspaceCatalogs }>;
  saveLocally(
    workspaceId: string,
    revision: string,
    catalogs: WorkspaceCatalogs,
  ): Promise<WorkspaceView>;
  publishPhoto(
    request: import("./main/publication").PublishRequest & { taskId?: string },
  ): Promise<
    import("./main/publication").PublishResult & { notification?: string }
  >;
  getRecovery(
    workspaceId: string,
  ): Promise<{
    items: import("./main/transactions").RecoveryItem[];
    locked: boolean;
  }>;
  recoverSave(
    workspaceId: string,
    transactionId: string | null,
  ): Promise<WorkspaceView>;
  previewWebsite(workspaceId: string, page: string): Promise<void>;
  reviewMigration(
    workspaceId: string,
  ): Promise<import("./main/migration").MigrationPhoto[]>;
  migratePhotos(
    workspaceId: string,
    revision: string,
    keys: string[],
    cleanup: boolean,
  ): Promise<WorkspaceView>;
  onCompanionTask(listener: (task: CompanionTask) => void): () => void;
  onWorkspaceChanged(listener: (workspaceId: string) => void): () => void;
}
declare global {
  interface Window {
    portfolio: DesktopBridge;
  }
}
