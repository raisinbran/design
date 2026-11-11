import { describe, expect, it } from "vitest";
import type { Catalogs, PortfolioView } from "../../backend/api/api";
import { editCatalogs, isDirty, loadView, showSaved, useEditor } from "./editor";

const loaded: Catalogs = {
  photography: { schemaVersion: 1, photoTags: [], photos: [] },
  engineering: { schemaVersion: 1, projects: [] },
  archive: { schemaVersion: 1, collections: [] },
};
const viewOf = (catalogs: Catalogs): PortfolioView => ({ folder: "/site", revision: {}, catalogs });
const setTags = (photoTags: string[]) =>
  editCatalogs((catalogs) => ({
    ...catalogs,
    photography: { ...catalogs.photography, photoTags },
  }));

describe("showSaved", () => {
  // An edit made while a save runs must stay unsaved, or the owner could close the app and lose it.
  it("keeps edits made during a save unsaved", () => {
    loadView(viewOf(loaded));
    setTags(["Day"]);
    const sent = useEditor.getState().catalogs!;
    setTags(["Day", "Night"]);
    const saved = viewOf(structuredClone(sent));

    showSaved(saved, sent);

    const state = useEditor.getState();
    expect(state.view).toBe(saved);
    expect(state.catalogs?.photography.photoTags).toEqual(["Day", "Night"]);
    expect(isDirty(state)).toBe(true);
  });
});
