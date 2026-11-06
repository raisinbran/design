import { builtinModules } from "node:module";
import { defineConfig } from "vite";

// The main process bundle. Electron, Node built-ins and sharp, a native module, load at run time.
export default defineConfig({
  build: {
    outDir: ".vite/build",
    emptyOutDir: true,
    minify: false,
    lib: { entry: "backend/main.ts", formats: ["cjs"], fileName: () => "main.cjs" },
    rollupOptions: {
      external: ["electron", "sharp", ...builtinModules.flatMap((name) => [name, `node:${name}`])],
    },
  },
  resolve: { conditions: ["node"], mainFields: ["module", "jsnext:main", "jsnext"] },
});
