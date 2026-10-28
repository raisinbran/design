import React, { useState } from "react";
import type { WorkspaceView } from "../contracts";
import type { MigrationPhoto } from "../main/migration";
import type { RecoveryItem } from "../main/transactions";
export function LocalTools({
  workspace,
  changed,
  report,
  allowChange,
  busyChanged,
}: {
  workspace: WorkspaceView | null;
  changed: (workspace: WorkspaceView) => void;
  report: (message: string) => void;
  allowChange: () => boolean;
  busyChanged: (busy: boolean) => void;
}) {
  const [migration, setMigration] = useState<MigrationPhoto[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [recovery, setRecovery] = useState<RecoveryItem[]>([]);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!workspace)
    return <p>Choose a portfolio folder to review migration and recovery.</p>;
  const action = async (work: () => Promise<void>) => {
    setBusy(true);
    busyChanged(true);
    try {
      await work();
    } catch (error) {
      report(String(error));
    } finally {
      setBusy(false);
      busyChanged(false);
    }
  };
  return (
    <>
      <fieldset>
        <legend>Local Save Recovery</legend>
        <p>
          Private backups can restore an interrupted save or undo a completed
          local transaction. Recovery refuses files changed elsewhere and any
          running writer.
        </p>
        <button
          disabled={busy}
          onClick={() =>
            void action(async () => {
              const result = await window.portfolio.getRecovery(workspace.id);
              setRecovery(result.items);
              setLocked(result.locked);
              report("Recovery records refreshed.");
            })
          }
        >
          Review Recovery Records
        </button>
        {locked && (
          <button
            disabled={busy}
            onClick={() => {
              if (allowChange())
                void action(async () =>
                  changed(
                    await window.portfolio.recoverSave(workspace.id, null),
                  ),
                );
            }}
          >
            Recover Stale Writer Lock
          </button>
        )}
        {recovery.map((item) => (
          <div className="context-card" key={item.id}>
            <strong>{item.title}</strong>
            <p>
              {item.createdAt} · {item.state}
            </p>
            <button
              disabled={busy || item.state === "rolled-back"}
              onClick={() => {
                if (allowChange())
                  void action(async () => {
                    changed(
                      await window.portfolio.recoverSave(workspace.id, item.id),
                    );
                    setRecovery(
                      (await window.portfolio.getRecovery(workspace.id)).items,
                    );
                    report("Local files restored from the private backup.");
                  });
              }}
            >
              Restore Before This Save
            </button>
          </div>
        ))}
      </fieldset>
      <fieldset>
        <legend>Legacy Single-Image Migration</legend>
        <p>
          Review legacy full-size references first. Migration keeps those files.
          Cleanup is a separate deliberate action and retains private recovery
          backups.
        </p>
        <button
          disabled={busy}
          onClick={() =>
            void action(async () => {
              setMigration(
                await window.portfolio.reviewMigration(workspace.id),
              );
              setSelected([]);
              report(
                "Reference review complete. Select photographs to migrate or eligible files to clean up.",
              );
            })
          }
        >
          Identify Legacy References
        </button>
        {migration.map((photo) => (
          <div className="context-card" key={photo.photoKey}>
            <label>
              <input
                type="checkbox"
                checked={selected.includes(photo.photoKey)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, photo.photoKey]
                      : current.filter((key) => key !== photo.photoKey),
                  )
                }
              />
              {photo.photoKey}
            </label>
            <p>
              {photo.migrated
                ? "Single Published Image"
                : "Legacy paired entry"}{" "}
              · {photo.fullSize}
            </p>
            {photo.references.length > 0 && (
              <p>References: {photo.references.join(", ")}</p>
            )}
            <p>
              {photo.reason ||
                (photo.canCleanup
                  ? "Eligible for reviewed cleanup."
                  : "Full-size files retained.")}
            </p>
          </div>
        ))}
        <div className="toolbar">
          <button
            disabled={busy || !selected.length}
            onClick={() => {
              if (allowChange())
                void action(async () => {
                  const result = await window.portfolio.migratePhotos(
                    workspace.id,
                    workspace.revision,
                    selected,
                    false,
                  );
                  changed(result);
                  setMigration(
                    await window.portfolio.reviewMigration(result.id),
                  );
                  report(
                    "Single-image catalog migration saved locally. Full-size files retained.",
                  );
                });
            }}
          >
            Migrate Selected and Keep Files
          </button>
          <button
            className="danger"
            disabled={
              busy ||
              !selected.length ||
              selected.some(
                (key) =>
                  !migration.find((photo) => photo.photoKey === key)
                    ?.canCleanup,
              )
            }
            onClick={() => {
              if (allowChange())
                void action(async () => {
                  const result = await window.portfolio.migratePhotos(
                    workspace.id,
                    workspace.revision,
                    selected,
                    true,
                  );
                  changed(result);
                  setMigration(
                    await window.portfolio.reviewMigration(result.id),
                  );
                  report(
                    "Reviewed full-size files removed locally; private recovery backups retained.",
                  );
                });
            }}
          >
            Clean Up Eligible Selected Files
          </button>
        </div>
      </fieldset>
    </>
  );
}
