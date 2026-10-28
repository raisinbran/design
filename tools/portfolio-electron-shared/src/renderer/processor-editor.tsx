import React from "react";
import type { EditRecipe } from "../models";
import type { SourceSelection, RenderPreview } from "../contracts";
import { Field } from "./studio-editor";
export interface QueueItem extends SourceSelection {
  state: "queued" | "ready" | "processing" | "published" | "failed";
  error?: string;
  preview?: RenderPreview;
  renderedRecipe?: EditRecipe;
  progress?: string;
}
export interface ProcessorEditorProps {
  queue: QueueItem[];
  selectedId: string;
  select: (id: string) => void;
  remove: (id: string) => void;
  importOriginals: () => void;
  recipe: EditRecipe;
  change: (recipe: EditRecipe) => void;
  previewUrl?: string;
  previewBusy?: boolean;
  requestPreview?: () => void;
  needsRelink?: boolean;
  renderBatch?: () => void;
  cancelProcessing?: () => void;
  saveDefaults?: () => void;
}
export function ProcessorEditor({
  queue,
  selectedId,
  select,
  remove,
  importOriginals,
  recipe,
  change,
  previewUrl,
  previewBusy,
  requestPreview,
  needsRelink,
  renderBatch,
  cancelProcessing,
  saveDefaults,
}: ProcessorEditorProps) {
  const selected = queue.find((item) => item.id === selectedId);
  const numeric = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    update: (value: number) => void,
  ) => (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (Number.isFinite(value))
            update(Math.min(max, Math.max(min, value)));
        }}
      />
    </label>
  );
  return (
    <div className="processor-grid">
      <section className="record-list queue-panel">
        <div className="list-heading">
          <strong>Import Queue</strong>
          <button className="primary" onClick={importOriginals}>
            {needsRelink ? "Relink Original" : "Import Originals"}
          </button>
        </div>
        <p className="muted">Originals remain read-only.</p>
        <button disabled={!queue.length || previewBusy} onClick={renderBatch}>
          Render Queue Previews
        </button>
        {previewBusy && (
          <button onClick={cancelProcessing}>Cancel Processing</button>
        )}
        <div className="record-scroll">
          {queue.length ? (
            queue.map((item) => (
              <div key={item.id} className="queue-item">
                <button
                  className="record"
                  aria-pressed={selectedId === item.id}
                  onClick={() => select(item.id)}
                >
                  <span>{item.name}</span>
                  <small>
                    {item.state}
                    {item.progress ? ` · ${item.progress}` : ""}
                    {item.error ? ` · ${item.error}` : ""}
                  </small>
                </button>
                <button
                  aria-label={`Remove ${item.name} from queue`}
                  onClick={() => remove(item.id)}
                  disabled={item.state === "processing"}
                >
                  ×
                </button>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <h3>No originals imported</h3>
              <p>Import photographs to prepare their Published Images.</p>
            </div>
          )}
        </div>
      </section>
      <section
        className="preview-workspace"
        aria-label="Published Image preview"
      >
        <div className="preview-title">
          <h3>{selected?.name || "Published Image"}</h3>
          <span className="badge">
            {recipe.format.toUpperCase()} · {recipe.maxSide}px
          </span>
        </div>
        <div className="image-stage">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={`Encoded Published Image preview of ${selected?.name || "selected photograph"}`}
            />
          ) : (
            <div className="empty-state">
              <div className="image-symbol" aria-hidden>
                ▧
              </div>
              <h3>
                {needsRelink ? "Original needs relinking" : "Encoded preview"}
              </h3>
              <p>
                {needsRelink
                  ? "Select the original to resume its private edit recipe."
                  : selected
                    ? "Render the current recipe to inspect its exact encoded output."
                    : "Select an imported original to begin."}
              </p>
            </div>
          )}
        </div>
        <div className="preview-controls">
          <button
            disabled={!selected || !requestPreview || previewBusy}
            onClick={requestPreview}
          >
            {previewBusy ? "Rendering…" : "Render Encoded Preview"}
          </button>
          <p className="muted">
            Preview displays the exact encoded Published Image. Changing the
            recipe requires a new preview.
          </p>
        </div>
      </section>
      <section className="processing-controls">
        <h3>Framing and Output</h3>
        <button onClick={saveDefaults}>
          Save Current Settings as Defaults
        </button>
        {numeric(
          "Rotation (degrees)",
          recipe.rotation,
          -270,
          270,
          90,
          (rotation) => change({ ...recipe, rotation }),
        )}
        {numeric(
          "Straighten (degrees)",
          recipe.straighten,
          -45,
          45,
          0.1,
          (straighten) => change({ ...recipe, straighten }),
        )}
        <label className="toggle">
          <input
            type="checkbox"
            checked={!!recipe.crop}
            onChange={(event) =>
              change({
                ...recipe,
                crop: event.target.checked
                  ? { x: 0, y: 0, width: 1, height: 1 }
                  : undefined,
              })
            }
          />
          Crop photograph
        </label>
        {recipe.crop && (
          <fieldset>
            <legend>Normalized Crop</legend>
            {(["x", "y", "width", "height"] as const).map((key) => (
              <React.Fragment key={key}>
                {numeric(
                  key,
                  recipe.crop![key],
                  key === "width" || key === "height" ? 0.01 : 0,
                  1,
                  0.01,
                  (value) =>
                    change({
                      ...recipe,
                      crop: { ...recipe.crop!, [key]: value },
                    }),
                )}
              </React.Fragment>
            ))}
            <small>
              Coordinates refer to the oriented and straightened image.
            </small>
          </fieldset>
        )}
        {numeric(
          "Published Image maximum side",
          recipe.maxSide,
          64,
          12000,
          1,
          (maxSide) => change({ ...recipe, maxSide }),
        )}
        <label className="field">
          <span>Format</span>
          <select
            value={recipe.format}
            onChange={(event) =>
              change({
                ...recipe,
                format: event.target.value as EditRecipe["format"],
              })
            }
          >
            <option value="webp">WebP</option>
            <option value="jpeg">JPEG</option>
            <option value="png">PNG</option>
          </select>
        </label>
        {numeric("Quality", recipe.quality, 1, 100, 1, (quality) =>
          change({ ...recipe, quality }),
        )}
        <h3>Protection</h3>
        {(["tiled", "corner"] as const).map((key) => (
          <label className="toggle" key={key}>
            <input
              type="checkbox"
              checked={recipe.watermark[key]}
              onChange={(event) =>
                change({
                  ...recipe,
                  watermark: {
                    ...recipe.watermark,
                    [key]: event.target.checked,
                  },
                })
              }
            />
            {key === "tiled" ? "Tiled watermark" : "Corner watermark"}
          </label>
        ))}
        {numeric(
          "Watermark strength",
          recipe.watermark.strength,
          0,
          1,
          0.01,
          (strength) =>
            change({ ...recipe, watermark: { ...recipe.watermark, strength } }),
        )}
        <Field
          label="Watermark text"
          value={recipe.watermark.text}
          onChange={(text) =>
            change({ ...recipe, watermark: { ...recipe.watermark, text } })
          }
        />
        <details>
          <summary>Authorship and Usage Notices</summary>
          <Field
            label="Author"
            value={recipe.rights.author}
            onChange={(author) =>
              change({ ...recipe, rights: { ...recipe.rights, author } })
            }
          />
          <Field
            label="Copyright"
            value={recipe.rights.copyright}
            onChange={(copyright) =>
              change({ ...recipe, rights: { ...recipe.rights, copyright } })
            }
          />
          <Field
            label="Usage notice"
            multiline
            value={recipe.rights.usageNotice}
            onChange={(usageNotice) =>
              change({ ...recipe, rights: { ...recipe.rights, usageNotice } })
            }
          />
          <p className="muted">
            Embedded notices communicate restrictions; they do not technically
            prevent AI training.
          </p>
        </details>
      </section>
    </div>
  );
}
