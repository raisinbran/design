import { readFileSync } from "node:fs";
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
  // The Help screen shows the version from package.json.
  define: {
    __APP_VERSION__: JSON.stringify(
      JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")).version,
    ),
  },
  build: { outDir: "../.vite/renderer", emptyOutDir: true },
});
