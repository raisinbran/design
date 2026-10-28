import { spawn } from "node:child_process";
import path from "node:path";

/** Squirrel invokes the installed executable to create/remove the owner's application shortcuts. */
export function installerShortcutAction(argument: string): string | null {
  if (argument === "--squirrel-install" || argument === "--squirrel-updated")
    return "--createShortcut";
  if (argument === "--squirrel-uninstall") return "--removeShortcut";
  return null;
}
export function handleWindowsInstaller(quit: () => void): boolean {
  if (process.platform !== "win32") return false;
  const argument = process.argv[1];
  if (argument === "--squirrel-obsolete") {
    quit();
    return true;
  }
  const action = installerShortcutAction(argument);
  if (!action) return false;
  const updater = path.resolve(
    path.dirname(process.execPath),
    "..",
    "Update.exe",
  );
  const child = spawn(updater, [action, path.basename(process.execPath)], {
    windowsHide: true,
  });
  child.once("error", quit);
  child.once("close", quit);
  return true;
}
