import { builtinModules } from 'node:module';
import path from 'node:path';
import type { UserConfig } from 'vite';
const external = ['electron', 'sharp', 'heic-decode', 'cheerio', ...builtinModules, ...builtinModules.map(name => `node:${name}`)];
export const mainConfig: UserConfig = {
  build: { outDir: '.vite/build', emptyOutDir: false, target: 'node22', minify: false,
    lib: { entry: { main: 'src/main.ts', 'image-worker': '../portfolio-electron-shared/src/processing/image-worker.ts' }, formats: ['cjs'], fileName: (_format, name) => `${name}.js` }, rollupOptions: { external } },
};
export const preloadConfig: UserConfig = {
  build: { outDir: '.vite/build', emptyOutDir: false, target: 'node22', minify: false,
    lib: { entry: 'src/preload.ts', formats: ['cjs'], fileName: () => 'preload.js' }, rollupOptions: { external } },
};
export const rendererConfig: UserConfig = {
  base: './',
  resolve: { alias: { react: path.resolve('node_modules/react'), 'react-dom': path.resolve('node_modules/react-dom') } },
  server: { fs: { allow: [path.resolve('../..')] } },
  build: { outDir: '.vite/renderer/main_window', emptyOutDir: true },
};
