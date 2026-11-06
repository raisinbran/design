import {
  BrowserWindow,
  screen,
  type BrowserWindowConstructorOptions,
  type Rectangle,
} from "electron";
import Store from "electron-store";
import { z } from "zod";

const WindowState = z.object({
  bounds: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  maximized: z.boolean(),
});

/**
 * Opens a window with the bounds and maximized state saved when the last one closed.
 * Bounds that no longer overlap a display give a centered window of the default size.
 */
export function openRememberedWindow(options: BrowserWindowConstructorOptions): BrowserWindow {
  const store = new Store({ name: "window-state", clearInvalidConfig: true });
  const saved = WindowState.safeParse(store.get("state"));
  const state = saved.success && isOnDisplay(saved.data.bounds) ? saved.data : undefined;

  const window = new BrowserWindow({ width: 1280, height: 820, ...state?.bounds, ...options });
  if (state?.maximized) window.maximize();
  window.on("close", () => {
    store.set("state", { bounds: window.getNormalBounds(), maximized: window.isMaximized() });
  });
  return window;
}

// The display may have been unplugged since the bounds were saved.
function isOnDisplay(bounds: Rectangle): boolean {
  const area = screen.getDisplayMatching(bounds).workArea;
  return (
    bounds.x < area.x + area.width &&
    bounds.x + bounds.width > area.x &&
    bounds.y < area.y + area.height &&
    bounds.y + bounds.height > area.y
  );
}
