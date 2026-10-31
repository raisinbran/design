import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import type { ForgeConfig } from "@electron-forge/shared-types";

// `npm run package` and `npm run make` build with Vite first; Forge only packages the result.
const config: ForgeConfig = {
  packagerConfig: {
    executableName: "portfolio-studio",
    // sharp loads native libraries, which cannot load from inside the asar archive.
    asar: { unpack: "**/node_modules/{sharp,@img}/**/*" },
    // Ship the Vite output and `dependencies`; the packager prunes devDependencies from node_modules.
    ignore: (file) => !!file && !/^\/(\.vite|node_modules)(\/|$)|^\/package\.json$/.test(file),
  },
  makers: [
    new MakerSquirrel({}),
    new MakerDMG({}),
    // The .deb ships chrome-sandbox root-owned with mode 4755, which the Linux sandbox needs.
    new MakerDeb({}),
  ],
};

export default config;
