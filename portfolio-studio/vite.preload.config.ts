import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: ".vite/build",
    emptyOutDir: false,
    minify: false,
    lib: { entry: "backend/preload.ts", formats: ["cjs"], fileName: () => "preload.cjs" },
    rollupOptions: { external: ["electron"] },
  },
});
