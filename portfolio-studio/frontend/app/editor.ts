import { temporal } from "zundo";
import { create } from "zustand";
import type { Catalogs, PortfolioView } from "../../backend/api/api";

interface Editor {
  /** The folder as last loaded or saved. */
  view: PortfolioView | null;
  /** The catalogs with unsaved edits; the same object as `view.catalogs` until the first edit. */
  catalogs: Catalogs | null;
}

// Edits less than this far apart, such as the keystrokes of one word, share one undo step.
const UNDO_STEP_MS = 500;
let lastEdit = 0;

export const useEditor = create<Editor>()(
  temporal((): Editor => ({ view: null, catalogs: null }), {
    partialize: ({ catalogs }) => ({ catalogs }),
    // A change to `view` alone is not an undo step.
    equality: (past, current) => past.catalogs === current.catalogs,
    handleSet: (record) => (pastState, replace) => {
      const now = Date.now();
      if (now - lastEdit > UNDO_STEP_MS) record(pastState, replace);
      lastEdit = now;
    },
  }),
);

export const isDirty = (state: Editor) => state.catalogs !== state.view?.catalogs;

/** Shows `view` and drops the unsaved edits and their undo history. */
export function loadView(view: PortfolioView | null): void {
  useEditor.setState({ view, catalogs: view?.catalogs ?? null });
  useEditor.temporal.getState().clear();
}

/** Shows the saved `view`; edits made after `sent` went to the save stay unsaved, with their undo history. */
export function showSaved(view: PortfolioView, sent: Catalogs): void {
  if (useEditor.getState().catalogs === sent) loadView(view);
  else useEditor.setState({ view });
}

export function editCatalogs(change: (catalogs: Catalogs) => Catalogs): void {
  useEditor.setState(({ catalogs }) => ({ catalogs: catalogs && change(catalogs) }));
}

// Undo and redo bypass handleSet, so the next edit must start a new undo step.
export function undo(): void {
  lastEdit = 0;
  useEditor.temporal.getState().undo();
}

export function redo(): void {
  lastEdit = 0;
  useEditor.temporal.getState().redo();
}

export function confirmDiscard(): boolean {
  return !isDirty(useEditor.getState()) || window.confirm("Discard unsaved edits?");
}
