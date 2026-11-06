import Store from "electron-store";
import { z } from "zod";
import type { AppSettings, ImageSettings } from "./api/api";

const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  rights: {
    author: "Brandon J. Chen",
    copyright: "Copyright (c) Brandon J. Chen",
    usageTerms:
      "AI/ML training, generative AI training, model fine-tuning, dataset creation, and automated style imitation are not authorized. Contact Brandon J. Chen for permission.",
  },
  watermark: { text: "Brandon J. Chen", tiled: true, corner: true, strength: 0.2 },
};

// Each part falls back to its default on its own, so a bad watermark setting keeps the folder.
const Settings = z.object({
  folder: z.string().nullable().catch(null),
  rights: z
    .object({ author: z.string(), copyright: z.string(), usageTerms: z.string() })
    .catch(DEFAULT_IMAGE_SETTINGS.rights),
  watermark: z
    .object({
      text: z.string(),
      tiled: z.boolean(),
      corner: z.boolean(),
      strength: z.number().min(0).max(1),
    })
    .catch(DEFAULT_IMAGE_SETTINGS.watermark),
}) satisfies z.ZodType<AppSettings>;

let store: Store | undefined;
const settingsStore = () => (store ??= new Store({ name: "settings", clearInvalidConfig: true }));

export function readSettings(): AppSettings {
  return Settings.parse(settingsStore().store);
}

export function writeSettings(settings: AppSettings): void {
  settingsStore().store = { ...settings };
}
