import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';


/** Both packages include their own native image runtime and share no installed companion files. */
export function makeForgeConfig(name: string): ForgeConfig {
  return {
    packagerConfig: { asar: { unpack: '**/node_modules/{sharp,@img}/**/*' }, name, executableName: name.replaceAll(' ', ''),
      appBundleId: `com.brandonjchen.${name.replaceAll(' ', '').toLowerCase()}`,
      // Vite's default excludes node_modules; external native dependencies must be included.
      prune: false,
      ignore: file => /^\/node_modules\/electron(?:\/|$)/.test(file) || (!!file && !file.startsWith('/.vite') && !file.startsWith('/node_modules') && file !== '/package.json'),
    },
    rebuildConfig: { onlyModules: [] },
    makers: [new MakerSquirrel({ name: name.replaceAll(' ', '') }), new MakerZIP({}, ['darwin', 'linux'])],
    plugins: [new VitePlugin({
      build: [
        { entry: 'src/main.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/preload.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    })],
  };
}

