import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  AppDefinition,
  EditRecipe,
  ThemePreference,
  WorkspaceCatalogs,
} from "../models";
import type {
  CompanionTask,
  WorkspaceView,
  ProcessingDraft,
} from "../contracts";
import {
  CompanionSettingsControl,
  CompanionTaskBanner,
} from "./companion-controls";
import {
  beginHistory,
  changeHistory,
  defaultRecipe,
  isDirty,
  redoHistory,
  undoHistory,
  type History,
} from "./editor-state";
import { StudioEditor } from "./studio-editor";
import { ProcessorEditor, type QueueItem } from "./processor-editor";
import { LocalTools } from "./local-tools";
import { Resizer } from "./resizer";
import "./base.css";
const icons: Record<string, string> = {
  Photography: "◈",
  Engineering: "⌘",
  Archive: "▤",
  Settings: "⚙",
  About: "ⓘ",
  "Import Queue": "⇣",
  "Published Image": "▧",
  Recovery: "↺",
};
function Application({
  definition,
  initialTheme,
}: {
  definition: AppDefinition;
  initialTheme: ThemePreference;
}) {
  const [workspace, setWorkspace] = useState<WorkspaceView | null>(null);
  const [history, setHistory] = useState<History<WorkspaceCatalogs> | null>(
    null,
  );
  const [section, setSection] = useState(definition.sections[0]);
  const [theme, setTheme] = useState(initialTheme);
  const [status, setStatus] = useState("Choose a portfolio folder to begin.");
  const [externalUpdate, setExternalUpdate] = useState(false);
  const [pendingTask, setPendingTask] = useState<CompanionTask | null>(null);
  const [companionTask, setCompanionTask] = useState<CompanionTask | null>(
    null,
  );
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [needsRelink, setNeedsRelink] = useState(false);
  const [processingId, setProcessingId] = useState("");
  const [drafts, setDrafts] = useState<ProcessingDraft[]>([]);
  const cancelBatch = useRef(false);
  const processingContext = useRef({
    selectedId,
    recipes: {} as Record<string, EditRecipe>,
    workspaceId: "",
  });
  const [recipeHistory, setRecipeHistory] = useState<
    History<Record<string, EditRecipe>>
  >(beginHistory({ defaults: defaultRecipe() }));
  const [saving, setSaving] = useState(false);
  const [publicationFields, setPublicationFields] = useState<
    Record<string, { name: string; alt: string; tags: string }>
  >({});
  const [locks, setLocks] = useState(new Set<string>());
  const [navWidth, setNavWidth] = useState(224);
  const [contextWidth, setContextWidth] = useState(244);
  const dirty = !!(
    workspace &&
    history &&
    isDirty(workspace.catalogs, history.present)
  );
  const recipeDirty = recipeHistory.past.length > 0;
  const processorDirty =
    recipeDirty || queue.some((item) => item.state !== "published");
  const stateRef = useRef({ workspace, dirty, recipeDirty: processorDirty });
  stateRef.current = { workspace, dirty, recipeDirty: processorDirty };
  const recipeKey = selectedId || "defaults";
  const recipe =
    recipeHistory.present[recipeKey] || recipeHistory.present.defaults;
  processingContext.current = {
    selectedId,
    recipes: recipeHistory.present,
    workspaceId: workspace?.id || "",
  };
  const preview = queue.find((item) => item.id === selectedId)?.preview;
  const activePreview =
    preview &&
    JSON.stringify(
      recipeHistory.present[selectedId] || recipeHistory.present.defaults,
    ) ===
      JSON.stringify(
        queue.find((item) => item.id === selectedId)?.renderedRecipe,
      )
      ? preview
      : undefined;
  const selectedQueueItem = queue.find((item) => item.id === selectedId);
  const framingPhoto = companionTask?.photoKey
    ? workspace?.catalogs.photography.photos.find(
        (photo) => photo.file === companionTask.photoKey,
      )
    : undefined;
  const selectedFields = publicationFields[selectedId] || {
    name: selectedQueueItem?.name || "",
    alt:
      framingPhoto?.alt ??
      selectedQueueItem?.name.replace(/\.[^.]+$/, "") ??
      "",
    tags: framingPhoto?.tags.join(", ") || "",
  };
  const patchPublicationFields = (values: Partial<typeof selectedFields>) =>
    setPublicationFields((current) => ({
      ...current,
      [selectedId]: { ...selectedFields, ...values },
    }));

  useEffect(() => {
    if (!definition.ownsPixelProcessing) return;
    void window.portfolio
      .getProcessingDefaults()
      .then((saved) => {
        if (saved)
          setRecipeHistory((current) =>
            current.past.length || Object.keys(current.present).length > 1
              ? current
              : beginHistory({ defaults: saved }),
          );
      })
      .catch((error) => setStatus(String(error)));
    return window.portfolio.onProcessingProgress(({ sourceId, stage }) =>
      setQueue((current) =>
        current.map((item) =>
          item.id === sourceId ? { ...item, progress: stage } : item,
        ),
      ),
    );
  }, []);
  const renderSource = async (sourceId: string) => {
    const sourceRecipe = structuredClone(
      processingContext.current.recipes[sourceId] ||
        processingContext.current.recipes.defaults,
    );
    const contextWorkspace = processingContext.current.workspaceId;
    setProcessingId(sourceId);
    setQueue((current) =>
      current.map((item) =>
        item.id === sourceId
          ? { ...item, state: "processing", error: undefined }
          : item,
      ),
    );
    try {
      await window.portfolio.saveProcessingDraft(sourceId, sourceRecipe);
      const encoded = await window.portfolio.renderPreview(
        sourceId,
        sourceRecipe,
      );
      const latest =
        processingContext.current.recipes[sourceId] ||
        processingContext.current.recipes.defaults;
      if (
        processingContext.current.workspaceId !== contextWorkspace ||
        JSON.stringify(latest) !== JSON.stringify(sourceRecipe)
      ) {
        setQueue((current) =>
          current.map((item) =>
            item.id === sourceId
              ? { ...item, state: "queued", progress: undefined }
              : item,
          ),
        );
        setStatus(
          "Recipe changed while rendering. Render the current recipe again.",
        );
        return;
      }
      setQueue((current) =>
        current.map((item) =>
          item.id === sourceId
            ? {
                ...item,
                state: "ready",
                preview: encoded,
                renderedRecipe: sourceRecipe,
                progress: undefined,
              }
            : item,
        ),
      );
      setStatus(
        `Published Image preview ready: ${encoded.width} × ${encoded.height}, ${Math.round(encoded.byteLength / 1024)} KB.`,
      );
    } catch (error) {
      setQueue((current) =>
        current.map((item) =>
          item.id === sourceId
            ? {
                ...item,
                state: "failed",
                error: String(error),
                progress: undefined,
              }
            : item,
        ),
      );
      setStatus(String(error));
    } finally {
      setProcessingId("");
    }
  };
  const renderQueue = async () => {
    cancelBatch.current = false;
    for (const item of queue) {
      if (cancelBatch.current) break;
      await renderSource(item.id);
    }
  };
  const loadWorkspace = (selected: WorkspaceView) => {
    setWorkspace(selected);
    setHistory(beginHistory(selected.catalogs));
    setLocks(new Set());
    setExternalUpdate(false);
  };
  const confirmDiscard = () =>
    !saving &&
    (!(
      stateRef.current.dirty ||
      (definition.ownsPixelProcessing && stateRef.current.recipeDirty)
    ) ||
      confirm("Discard unsaved edits before switching portfolios?"));
  const selectWorkspace = async () => {
    if (!confirmDiscard()) return;
    try {
      const selected = await window.portfolio.chooseWorkspace();
      if (selected) {
        loadWorkspace(selected);
        setCompanionTask(null);
        setPendingTask(null);
        setQueue([]);
        setSelectedId("");
        setNeedsRelink(false);
        setRecipeHistory(beginHistory({ defaults: defaultRecipe() }));
        setStatus("Portfolio loaded.");
      }
    } catch (error) {
      setStatus(String(error));
    }
  };
  const refresh = async () => {
    if (!workspace) return;
    if (
      dirty &&
      !confirm("Reload the catalog and discard staged management edits?")
    )
      return;
    try {
      loadWorkspace(await window.portfolio.refreshWorkspace(workspace.id));
      setStatus("Catalog refreshed.");
    } catch (error) {
      setStatus(String(error));
    }
  };
  const acceptTask = async (task: CompanionTask) => {
    if (!confirmDiscard()) {
      setPendingTask(task);
      setStatus("Companion task waiting. Current edits are preserved.");
      return;
    }
    loadWorkspace(task.workspace);
    setCompanionTask(task);
    setPendingTask(null);
    setQueue([]);
    setSelectedId("");
    setNeedsRelink(false);
    setRecipeHistory(beginHistory({ defaults: defaultRecipe() }));
    setSection(
      task.operation === "reframe" ? "Published Image" : "Import Queue",
    );
    if (task.operation === "reframe") {
      try {
        const saved = await window.portfolio.getCompanionSource(task.id);
        setNeedsRelink(saved.needsRelink);
        if (saved.source) {
          setQueue([{ ...saved.source, state: "queued" }]);
          setSelectedId(saved.source.id);
        } else {
          setQueue([]);
          setSelectedId("");
        }
        setRecipeHistory(
          beginHistory({
            defaults: saved.recipe || defaultRecipe(),
            ...(saved.source
              ? { [saved.source.id]: saved.recipe || defaultRecipe() }
              : {}),
          }),
        );
      } catch (error) {
        setStatus(String(error));
        return;
      }
    }
    setStatus("Companion task received.");
  };
  useEffect(() => {
    const unsubscribe = window.portfolio.onCompanionTask(
      (task) => void acceptTask(task),
    );
    if (definition.ownsPixelProcessing)
      void window.portfolio
        .getCompanionTasks()
        .then((tasks) => {
          if (tasks.length) void acceptTask(tasks[tasks.length - 1]);
        })
        .catch((error) => setStatus(String(error)));
    return unsubscribe;
  }, []);
  useEffect(
    () =>
      window.portfolio.onWorkspaceChanged((id) => {
        if (stateRef.current.workspace?.id !== id) return;
        if (stateRef.current.dirty) {
          setExternalUpdate(true);
          setStatus(
            "Portfolio changed externally. Your staged edits are preserved; reload when ready.",
          );
          return;
        }
        void window.portfolio
          .refreshWorkspace(id)
          .then((updated) => {
            if (stateRef.current.workspace?.id !== id) return;
            if (stateRef.current.dirty) {
              setExternalUpdate(true);
              setStatus(
                "External changes need review. Your staged edits are preserved.",
              );
              return;
            }
            loadWorkspace(updated);
            setStatus(
              "Photo Processor completed publication. Catalog refreshed.",
            );
          })
          .catch((error) => setStatus(String(error)));
      }),
    [],
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (stateRef.current.dirty || stateRef.current.recipeDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  const undo = () =>
    definition.ownsPixelProcessing
      ? setRecipeHistory(undoHistory)
      : setHistory((current) => current && undoHistory(current));
  const redo = () =>
    definition.ownsPixelProcessing
      ? setRecipeHistory(redoHistory)
      : setHistory((current) => current && redoHistory(current));
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const target = event.target as HTMLElement;
      const editing =
        target.matches("input, textarea, select") || target.isContentEditable;
      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        void selectWorkspace();
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!saving) void save();
      }
      if (!editing && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if (!editing && event.key.toLowerCase() === "y" && !event.metaKey) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });
  const reconcileExternal = async () => {
    if (!workspace || !history) return;
    try {
      const result = await window.portfolio.reconcileWorkspace(
        workspace.id,
        workspace.revision,
        history.present,
      );
      loadWorkspace(result.workspace);
      setHistory(
        changeHistory(beginHistory(result.workspace.catalogs), result.catalogs),
      );
      setStatus(
        "Independent external edits reconciled. Review the staged result before Save Locally.",
      );
    } catch (error) {
      setStatus(String(error));
    }
  };
  const publishSelected = async (
    sourceId: string,
    currentWorkspace: WorkspaceView,
  ): Promise<WorkspaceView> => {
    const item = queue.find((item) => item.id === sourceId);
    const sourceRecipe =
      recipeHistory.present[sourceId] || recipeHistory.present.defaults;
    if (
      item?.state === "published" ||
      !item?.preview ||
      JSON.stringify(item.renderedRecipe) !== JSON.stringify(sourceRecipe)
    )
      throw new Error("Render the current recipe before adding this photo.");
    const existing =
      companionTask?.operation === "reframe"
        ? currentWorkspace.catalogs.photography.photos.find(
            (photo) => photo.file === companionTask.photoKey,
          )
        : undefined;
    const fields = publicationFields[sourceId];
    const result = await window.portfolio.publishPhoto({
      workspaceId: currentWorkspace.id,
      revision: currentWorkspace.revision,
      sourceId,
      token: item.preview.token,
      recipe: sourceRecipe,
      photoKey: existing?.file,
      name: fields?.name || item.name,
      alt: fields?.alt ?? existing?.alt ?? item.name.replace(/\.[^.]+$/, ""),
      tags: fields
        ? fields.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : existing?.tags || [],
      taskId: companionTask?.id,
    });
    if (result.skipped) {
      setStatus("Publication skipped. Existing files are unchanged.");
      return result.workspace;
    }
    setQueue((current) =>
      current.map((entry) =>
        entry.id === sourceId ? { ...entry, state: "published" } : entry,
      ),
    );
    setCompanionTask(null);
    setRecipeHistory((current) => beginHistory(current.present));
    setStatus(
      result.notification ||
        "One Published Image and its catalog entry saved locally. Review with GitHub Desktop.",
    );
    return result.workspace;
  };
  const save = async () => {
    if (!workspace || saving) return;
    setSaving(true);
    try {
      const result = definition.ownsPixelProcessing
        ? await publishSelected(selectedId, workspace)
        : await window.portfolio.saveLocally(
            workspace.id,
            workspace.revision,
            history!.present,
          );
      loadWorkspace(result);
      if (!definition.ownsPixelProcessing)
        setStatus(
          "Management changes saved locally. Review with GitHub Desktop.",
        );
    } catch (error) {
      setStatus(String(error));
      if (String(error).includes("changed")) setExternalUpdate(true);
    } finally {
      setSaving(false);
    }
  };
  const importOriginals = async () => {
    try {
      const sources = await window.portfolio.chooseOriginals();
      if (!sources.length) return;
      const imported = needsRelink ? sources.slice(0, 1) : sources;
      setQueue((current) => [
        ...current,
        ...imported.map((source) => ({ ...source, state: "queued" as const })),
      ]);
      setSelectedId(imported[0].id);
      setNeedsRelink(false);
      setRecipeHistory((current) => ({
        ...current,
        present: {
          ...current.present,
          ...Object.fromEntries(imported.map((source) => [source.id, recipe])),
        },
      }));
      setStatus(
        `${imported.length} original${imported.length === 1 ? "" : "s"} added to the queue.`,
      );
    } catch (error) {
      setStatus(String(error));
    }
  };
  useEffect(() => {
    if (definition.ownsPixelProcessing && section === "Recovery")
      void window.portfolio
        .getProcessingDrafts()
        .then(setDrafts)
        .catch((error) => setStatus(String(error)));
  }, [section]);
  const canUndo = definition.ownsPixelProcessing
    ? !!recipeHistory.past.length
    : !!history?.past.length;
  const canRedo = definition.ownsPixelProcessing
    ? !!recipeHistory.future.length
    : !!history?.future.length;
  return (
    <div
      className="app-shell"
      style={
        {
          "--nav-width": `${navWidth}px`,
          "--context-width": `${contextWidth}px`,
        } as React.CSSProperties
      }
    >
      <aside className="navigation">
        <div className="app-brand">
          <span className="brand-mark" aria-hidden>
            {definition.ownsPixelProcessing ? "P" : "S"}
          </span>
          <div>
            <h1>{definition.name}</h1>
            <span className="muted">Your portfolio, locally.</span>
          </div>
        </div>
        <nav aria-label="Main navigation">
          {definition.sections.map((item) => (
            <button
              key={item}
              aria-current={item === section ? "page" : undefined}
              onClick={() => setSection(item)}
            >
              <span aria-hidden>{icons[item]}</span>
              {item}
            </button>
          ))}
        </nav>
        <div className="workspace-switcher">
          <span className="eyebrow">PORTFOLIO FOLDER</span>
          <strong>{workspace?.name || "No folder selected"}</strong>
          <button
            disabled={saving || !!processingId}
            onClick={() => void selectWorkspace()}
          >
            Choose Portfolio Folder
          </button>
        </div>
      </aside>
      <Resizer
        label="Resize navigation"
        value={navWidth}
        min={188}
        max={320}
        change={setNavWidth}
      />
      <main>
        <header className="workspace-header">
          <div>
            <span className="eyebrow">
              {definition.ownsPixelProcessing
                ? "PHOTO PROCESSOR"
                : "PORTFOLIO STUDIO"}
            </span>
            <h2>{section}</h2>
          </div>
          <div className="toolbar">
            <button
              disabled={saving || !canUndo}
              onClick={undo}
              title="Undo staged change"
            >
              ↶ Undo
            </button>
            <button
              disabled={saving || !canRedo}
              onClick={redo}
              title="Redo staged change"
            >
              ↷ Redo
            </button>
            <button
              className="primary"
              disabled={
                saving ||
                !workspace ||
                !!processingId ||
                (definition.ownsPixelProcessing
                  ? !activePreview ||
                    queue.find((item) => item.id === selectedId)?.state ===
                      "published"
                  : !dirty || externalUpdate)
              }
              onClick={() => void save()}
              title={
                definition.ownsPixelProcessing
                  ? "Add the selected encoded Published Image and catalog entry together"
                  : "Save staged management changes locally"
              }
            >
              {definition.primaryAction}
            </button>
          </div>
        </header>
        {externalUpdate && (
          <div className="notice warning" role="alert">
            <strong>External changes detected.</strong> Your staged edits are
            preserved.
            {!definition.ownsPixelProcessing && (
              <button
                disabled={saving}
                onClick={() => void reconcileExternal()}
              >
                Reconcile Independent Changes
              </button>
            )}
            <button disabled={saving} onClick={() => void refresh()}>
              Reload Catalog
            </button>
          </div>
        )}
        {pendingTask && (
          <div className="notice warning">
            A companion task is waiting.
            <button onClick={() => void acceptTask(pendingTask)}>
              Open Waiting Task
            </button>
          </div>
        )}
        {companionTask && <CompanionTaskBanner task={companionTask} />}
        <div
          className="workspace-content"
          inert={saving || undefined}
          aria-busy={saving}
        >
          {section === "Settings" ? (
            <section className="settings-page">
              <h3>Appearance</h3>
              <p className="muted">
                Use the same familiar workspace in any light.
              </p>
              <div
                className="theme-choices"
                role="group"
                aria-label="Appearance"
              >
                {(["light", "dark", "system"] as const).map((value) => (
                  <button
                    key={value}
                    aria-pressed={theme === value}
                    onClick={async () => {
                      const previous = theme;
                      setTheme(value);
                      try {
                        await window.portfolio.setTheme(value);
                      } catch (error) {
                        setTheme(previous);
                        setStatus(String(error));
                      }
                    }}
                  >
                    <span className={`theme-swatch ${value}`} />
                    {value[0].toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>
              <p>
                System follows operating-system appearance changes while the app
                is open.
              </p>
              {!definition.ownsPixelProcessing && (
                <CompanionSettingsControl report={setStatus} />
              )}
              {definition.ownsPixelProcessing && (
                <p>
                  Published Image output, watermark, and authorship controls are
                  available in the editing workspace.
                </p>
              )}
              <LocalTools
                key={workspace?.id}
                workspace={workspace}
                changed={loadWorkspace}
                report={setStatus}
                allowChange={confirmDiscard}
                busyChanged={setSaving}
              />
            </section>
          ) : section === "About" ? (
            <section className="settings-page">
              <div className="about-mark">
                {definition.ownsPixelProcessing ? "P" : "S"}
              </div>
              <h3>{definition.name}</h3>
              <p>
                {definition.ownsPixelProcessing
                  ? "Prepare one optimized, protected Published Image per photograph."
                  : "Organize Photography, Engineering, and Archive content in one local workspace."}
              </p>
              <p>
                Use GitHub Desktop to review, commit, and push website changes.
              </p>
              <p className="muted">
                Photo Processor and Portfolio Studio launch independently.
                Companion linking is optional.
              </p>
            </section>
          ) : section === "Recovery" ? (
            <section className="settings-page">
              <h3>Recovery</h3>
              <p>
                Private processing drafts can be resumed from their original.
                Choose the intended portfolio folder before publishing.
              </p>
              {drafts.length === 0 && <p>No saved processing drafts.</p>}
              {drafts.map((draft) => (
                <div className="context-card" key={draft.id}>
                  <strong>{draft.name}</strong>
                  <p>
                    {draft.needsRelink
                      ? "Original missing. Relink to resume."
                      : "Original available."}
                  </p>
                  <button
                    onClick={() => {
                      if (!confirmDiscard()) return;
                      setCompanionTask(null);
                      setQueue(
                        draft.needsRelink
                          ? []
                          : [
                              {
                                id: draft.id,
                                name: draft.name,
                                state: "queued",
                              },
                            ],
                      );
                      setSelectedId(draft.needsRelink ? "" : draft.id);
                      setNeedsRelink(draft.needsRelink);
                      setRecipeHistory(
                        beginHistory({
                          defaults: draft.recipe,
                          [draft.id]: draft.recipe,
                        }),
                      );
                      setSection("Published Image");
                      setStatus(
                        "Private draft restored. Render a new encoded preview before publication.",
                      );
                    }}
                  >
                    Resume Draft
                  </button>
                </div>
              ))}
              <LocalTools
                key={workspace?.id}
                workspace={workspace}
                changed={loadWorkspace}
                report={setStatus}
                allowChange={confirmDiscard}
                busyChanged={setSaving}
              />
              <p>
                Current queue: {queue.length} originals. Unpublished originals
                have not been modified.
              </p>
            </section>
          ) : definition.ownsPixelProcessing ? (
            <>
              <fieldset>
                <legend>Catalog Details for Selected Photo</legend>
                <label className="field">
                  Output name
                  <input
                    disabled={
                      saving ||
                      !selectedId ||
                      companionTask?.operation === "reframe"
                    }
                    value={selectedFields.name}
                    onChange={(event) =>
                      patchPublicationFields({ name: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Description
                  <input
                    disabled={saving || !selectedId}
                    value={selectedFields.alt}
                    onChange={(event) =>
                      patchPublicationFields({ alt: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Tags (comma separated)
                  <input
                    disabled={saving || !selectedId}
                    value={selectedFields.tags}
                    onChange={(event) =>
                      patchPublicationFields({ tags: event.target.value })
                    }
                  />
                </label>
              </fieldset>
              <ProcessorEditor
                queue={queue}
                selectedId={selectedId}
                select={setSelectedId}
                remove={(id) => {
                  setQueue((current) =>
                    current.filter((item) => item.id !== id),
                  );
                  if (selectedId === id)
                    setSelectedId(
                      queue.find((item) => item.id !== id)?.id || "",
                    );
                }}
                importOriginals={() => void importOriginals()}
                recipe={recipe}
                change={(value) =>
                  setRecipeHistory((current) =>
                    changeHistory(current, {
                      ...current.present,
                      [recipeKey]: value,
                    }),
                  )
                }
                needsRelink={needsRelink}
                previewUrl={activePreview?.dataUrl}
                previewBusy={!!processingId}
                requestPreview={() => void renderSource(selectedId)}
                renderBatch={() => void renderQueue()}
                cancelProcessing={() => {
                  cancelBatch.current = true;
                  void window.portfolio.cancelProcessing(processingId);
                }}
                saveDefaults={() =>
                  void window.portfolio
                    .setProcessingDefaults(recipe)
                    .then(() =>
                      setStatus("Processing defaults saved privately."),
                    )
                    .catch((error) => setStatus(String(error)))
                }
              />
            </>
          ) : workspace && history ? (
            <StudioEditor
              workspace={workspace}
              catalogs={history.present}
              section={section}
              change={(catalogs) =>
                setHistory(
                  (current) => current && changeHistory(current, catalogs),
                )
              }
              report={setStatus}
              locks={locks}
              setLocks={setLocks}
            />
          ) : (
            <div className="empty-state welcome">
              <span className="welcome-art" aria-hidden>
                ◈
              </span>
              <h3>A home for your work.</h3>
              <p>
                Choose your portfolio folder to browse and edit its local
                content.
              </p>
              <button
                className="primary"
                onClick={() => void selectWorkspace()}
              >
                Open Portfolio
              </button>
            </div>
          )}
        </div>
      </main>
      <Resizer
        label="Resize context panel"
        value={contextWidth}
        min={208}
        max={360}
        change={setContextWidth}
        reverse
      />
      <aside className="context-panel">
        <span className="eyebrow">WORKSPACE DETAILS</span>
        <h3>{workspace?.name || "Getting Started"}</h3>
        <p>
          {definition.ownsPixelProcessing
            ? "Import originals, adjust framing, then inspect the encoded Published Image."
            : "Edit locally and review your changes before publishing with GitHub Desktop."}
        </p>
        <div className="context-card">
          <span className="eyebrow">LOCAL STATUS</span>
          <strong>
            {saving
              ? "Saving Locally…"
              : dirty || recipeDirty
                ? "Unsaved edits"
                : "Ready"}
          </strong>
          <p>
            {externalUpdate
              ? "External changes need review."
              : "The selected website is unchanged until an explicit local save."}
          </p>
        </div>
        {workspace && (
          <>
            <div className="context-stat">
              <strong>{workspace.catalogs.photography.photos.length}</strong>
              <span>Photographs</span>
            </div>
            <div className="context-stat">
              <strong>{workspace.catalogs.engineering.projects.length}</strong>
              <span>Engineering projects</span>
            </div>
            <button disabled={saving} onClick={() => void refresh()}>
              Refresh Catalog
            </button>
            <button
              disabled={!workspace || saving}
              onClick={() => {
                if (workspace)
                  void window.portfolio
                    .previewWebsite(
                      workspace.id,
                      section === "Engineering"
                        ? "engineeringdesign.html"
                        : section === "Archive"
                          ? "creativedesign.html"
                          : "photography.html",
                    )
                    .catch((error) => setStatus(String(error)));
              }}
            >
              Preview Saved Website
            </button>
          </>
        )}
        <details className="shortcut-help">
          <summary>Keyboard Shortcuts</summary>
          <p>⌘ / Ctrl + O: open folder</p>
          <p>⌘ / Ctrl + Z: undo</p>
          <p>⌘ / Ctrl + Shift + Z: redo</p>
          <p>Arrow keys: resize focused divider</p>
        </details>
      </aside>
      <footer role="status" aria-live="polite">
        <span
          className={`status-dot ${dirty || recipeDirty ? "unsaved" : ""}`}
        />
        {status}
        <span className="footer-meta">
          {definition.ownsPixelProcessing
            ? `${queue.length} in queue`
            : dirty
              ? "Unsaved changes"
              : "Local workspace"}
        </span>
      </footer>
    </div>
  );
}
/** Resolve saved appearance before mounting; main sets native theme before revealing its window. */
export async function mountApplication(
  definition: AppDefinition,
): Promise<void> {
  let theme: ThemePreference = "system";
  try {
    theme = (await window.portfolio.getAppearance()).theme;
  } catch {
    /* A missing preference follows the OS. */
  }
  document.documentElement.dataset.theme = theme;
  createRoot(document.getElementById("root")!).render(
    <Application definition={definition} initialTheme={theme} />,
  );
}
