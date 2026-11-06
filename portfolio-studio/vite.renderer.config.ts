import path from "node:path";
import { defineConfig, normalizePath, type Plugin } from "vite";

const backend = normalizePath(path.resolve(__dirname, "backend")) + "/";

// Type-only imports vanish before bundling, so any backend module that gets here is a real import.
const keepBackendOut: Plugin = {
  name: "keep-backend-out",
  load(id) {
    if (normalizePath(id).startsWith(backend))
      this.error(`backend module in the renderer bundle: ${id}`);
  },
};

export default defineConfig({
  root: "frontend",
  base: "./",
  plugins: [keepBackendOut],
  build: { outDir: "../.vite/renderer", emptyOutDir: true },
});
