import assert from "node:assert/strict";
import test from "node:test";
import {
  beginHistory,
  changeHistory,
  defaultRecipe,
  movePhoto,
  redoHistory,
  suggestArrangement,
  undoHistory,
} from "../src/renderer/editor-state";
import type { Photo } from "../src/models";
const photo = (file: string, aspectRatio = 1.5): Photo => ({
  file,
  alt: file,
  aspectRatio,
  tags: ["Day"],
  visible: true,
  featured: false,
  displayPriority: "normal",
  extension: "preserved",
});
test("history supports undo/redo and discards redo when branching without mutating earlier snapshots", () => {
  const initial = { title: "Original", nested: { marker: true } };
  const first = changeHistory(beginHistory(initial), {
    ...initial,
    title: "Changed",
  });
  const undone = undoHistory(first);
  assert.equal(undone.present.title, "Original");
  assert.equal(initial.title, "Original");
  assert.equal(redoHistory(undone).present.title, "Changed");
  assert.equal(
    changeHistory(undone, { ...initial, title: "Another" }).future.length,
    0,
  );
});
test("manual and suggested arrangement preserve every locked absolute position and unknown fields", () => {
  const photos = [
    photo("z"),
    photo("locked", 0.6),
    photo("b", 0.8),
    photo("a"),
  ];
  const locks = new Set(["locked"]);
  assert.equal(movePhoto(photos, 0, 1, locks), photos);
  const moved = movePhoto(photos, 0, 2, locks);
  assert.equal(moved[1].file, "locked");
  const suggested = suggestArrangement(photos, locks);
  assert.equal(suggested[1].file, "locked");
  assert.deepEqual(
    suggested.map((item) => item.file).sort(),
    photos.map((item) => item.file).sort(),
  );
  assert.ok(suggested.every((item) => item.extension === "preserved"));
  assert.equal(photos[0].file, "z");
});
test("new recipes have independent nested settings and the required single-image defaults", () => {
  const first = defaultRecipe();
  const second = defaultRecipe();
  first.watermark.text = "Changed";
  assert.equal(second.watermark.text, "Brandon J. Chen");
  assert.equal(second.maxSide, 800);
  assert.equal(second.format, "webp");
  assert.equal(second.quality, 78);
});
