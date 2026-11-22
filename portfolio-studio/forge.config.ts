import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { join } from "node:path";

// `npm run package` and `npm run make` build with Vite first; Forge only packages the result.
const mainAppEntitlements = join(__dirname, "scripts", "macos-adhoc-main-entitlements.plist");
const config: ForgeConfig = {
  packagerConfig: {
    executableName: "portfolio-studio",
    // Ad-hoc CI signing does not require a keychain identity. Never ship an unsealed bundle.
    // Developer ID distribution and notarization require separately provisioned credentials.
    osxSign: {
      identity: "-",
      identityValidation: false,
      continueOnError: false,
      // Only the top-level app loading Electron Framework gets this approved exception.
      optionsForFile: (filePath) =>
        filePath.endsWith("/Portfolio Studio.app") && !filePath.includes(".app/Contents/")
          ? { entitlements: mainAppEntitlements }
          : {},
    },
    // Native code cannot read inside the asar archive, so sharp's libraries and the watermark font
    // stay outside.
    asar: { unpack: "{**/node_modules/{sharp,@img}/**/*,**/assets/fonts/*}" },
    // Ship the Vite output, the assets and `dependencies`; the packager prunes devDependencies from node_modules.
    ignore: (file) =>
      !!file && !/^\/(\.vite|node_modules|assets)(\/|$)|^\/package\.json$/.test(file),
  },
  makers: [
    new MakerSquirrel({}),
    new MakerDMG({}),
    // The .deb ships chrome-sandbox root-owned with mode 4755, which the Linux sandbox needs.
    new MakerDeb({}),
  ],
};

export default config;
