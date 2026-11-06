import Store from "electron-store";
import { z } from "zod";
import type { AppSettings } from "./api/api";

const Settings = z.object({ folder: z.string().nullable() }) satisfies z.ZodType<AppSettings>;

let store: Store | undefined;
const settingsStore = () => (store ??= new Store({ name: "settings", clearInvalidConfig: true }));

export function readSettings(): AppSettings {
  const parsed = Settings.safeParse(settingsStore().store);
  return parsed.success ? parsed.data : { folder: null };
}

export function writeSettings(settings: AppSettings): void {
  settingsStore().store = { ...settings };
}
