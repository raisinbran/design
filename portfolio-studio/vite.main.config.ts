import { builtinModules } from "node:module";
import { defineConfig } from "vite";

// The main process bundle and the render worker. Electron, Node built-ins and the `dependencies` load at
// run time: sharp is a native module, and heic-decode's LGPL decoder must ship unmodified.
export default defineConfig({
  build: {
    outDir: ".vite/build",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: { main: "backend/main.ts", "render-worker": "backend/imaging/render-worker.ts" },
      formats: ["cjs"],
      fileName: (_format, name) => `${name}.cjs`,
    },
    rollupOptions: {
      external: [
        "electron",
        "sharp",
        "heic-decode",
        ...builtinModules.flatMap((name) => [name, `node:${name}`]),
      ],
    },
  },
  resolve: { conditions: ["node"], mainFields: ["module", "jsnext:main", "jsnext"] },
});
