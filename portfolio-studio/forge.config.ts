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
      // The main app and its helper apps load the ad-hoc-signed Electron Framework, so they alone get
      // this approved exception. Electron Framework itself gets none.
      optionsForFile: (filePath) =>
        /\/Portfolio Studio( Helper( \((GPU|Renderer|Plugin)\))?)?\.app$/.test(filePath)
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
