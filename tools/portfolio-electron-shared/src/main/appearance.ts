import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AppearanceSettings } from "../contracts";
import type { ThemePreference } from "../models";
import { atomicWrite } from "./files";
export function validateTheme(value: unknown): ThemePreference {
  if (value !== "system" && value !== "dark" && value !== "light")
    throw new Error("Unknown appearance preference");
  return value;
}
export class AppearanceStore {
  constructor(private directory: string) {}
  async read(): Promise<AppearanceSettings> {
    try {
      return {
        theme: validateTheme(
          JSON.parse(
            await readFile(
              path.join(this.directory, "appearance.json"),
              "utf8",
            ),
          ).theme,
        ),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { theme: "system" };
      throw error;
    }
  }
  async set(theme: unknown): Promise<AppearanceSettings> {
    const settings = { theme: validateTheme(theme) };
    await atomicWrite(
      path.join(this.directory, "appearance.json"),
      JSON.stringify(settings),
    );
    return settings;
  }
}
