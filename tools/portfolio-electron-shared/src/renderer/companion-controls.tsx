import React, { useEffect, useState } from "react";
import type {
  CompanionSettings,
  CompanionTask,
  WorkspaceView,
} from "../contracts";

export function CompanionSettingsControl({
  report,
}: {
  report: (message: string) => void;
}) {
  const [settings, setSettings] = useState<CompanionSettings>({
    enabled: false,
    available: false,
    name: null,
  });
  useEffect(() => {
    void window.portfolio
      .getCompanionSettings()
      .then(setSettings)
      .catch((error) => report(String(error)));
  }, []);
  return (
    <fieldset>
      <legend>Photo Processor Integration</legend>
      <p>
        {settings.name
          ? `Located: ${settings.name}`
          : "Locate the installed Photo Processor to prepare photos from Studio."}
      </p>
      <button
        onClick={async () => {
          try {
            setSettings(await window.portfolio.locateCompanion());
          } catch (error) {
            report(String(error));
          }
        }}
      >
        Locate Photo Processor
      </button>
      <label>
        <input
          type="checkbox"
          checked={settings.enabled}
          disabled={!settings.available}
          onChange={async (event) => {
            try {
              setSettings(
                await window.portfolio.setCompanionEnabled(
                  event.target.checked,
                ),
              );
            } catch (error) {
              report(String(error));
            }
          }}
        />{" "}
        Enable companion linking
      </label>
      <p>
        You can also open Photo Processor independently and select the same
        portfolio folder.
      </p>
    </fieldset>
  );
}
export function CompanionLaunchControl({
  workspace,
  report,
}: {
  workspace: WorkspaceView;
  report: (message: string) => void;
}) {
  const [photoKey, setPhotoKey] = useState(
    workspace.catalogs.photography.photos[0]?.file || "",
  );
  const [busy, setBusy] = useState(false);
  const launch = async (operation: "import" | "reframe") => {
    setBusy(true);
    report("Opening Photo Processor…");
    try {
      await window.portfolio.launchCompanion(
        workspace.id,
        operation,
        operation === "reframe" ? photoKey : undefined,
      );
      report(
        "Photo Processor received the task. Studio will refresh when publication completes.",
      );
    } catch (error) {
      report(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <fieldset>
      <legend>Prepare Photographs</legend>
      <button disabled={busy} onClick={() => void launch("import")}>
        Prepare New Photos
      </button>
      <label>
        Existing photograph{" "}
        <select
          value={photoKey}
          onChange={(event) => setPhotoKey(event.target.value)}
        >
          {workspace.catalogs.photography.photos.map((photo) => (
            <option key={photo.file} value={photo.file}>
              {photo.alt || photo.file}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={busy || !photoKey}
        onClick={() => void launch("reframe")}
      >
        Edit Framing in Photo Processor
      </button>
    </fieldset>
  );
}
/** Processing owns task completion; this banner never claims publication before a real save. */
export function CompanionTaskBanner({ task }: { task: CompanionTask }) {
  return (
    <aside aria-label="Companion task">
      <strong>
        {task.operation === "import"
          ? "Prepare new photographs"
          : `Edit framing: ${task.photoKey}`}
      </strong>
      <p>
        Portfolio: {task.workspace.name}. Publication completion will refresh
        Studio if it is open.
      </p>
    </aside>
  );
}
