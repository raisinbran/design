import { contextBridge, ipcRenderer } from "electron";
import { METHODS } from "./ipc";

contextBridge.exposeInMainWorld(
  "portfolio",
  Object.fromEntries(
    METHODS.map((method) => [method, (...args: unknown[]) => ipcRenderer.invoke(method, ...args)]),
  ),
);
