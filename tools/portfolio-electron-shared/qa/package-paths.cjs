const path = require("node:path");
const { readdirSync } = require("node:fs");
exports.packagePaths = function packagePaths(folder, name) {
  const output = path.resolve("tools", folder, "out");
  const directory = readdirSync(output).find((entry) =>
    entry.startsWith(`${name}-${process.platform}-`),
  );
  if (!directory)
    throw new Error(`Package ${name} for ${process.platform} first`);
  const base = path.join(output, directory);
  return process.platform === "darwin"
    ? {
        executable: path.join(
          base,
          `${name}.app`,
          "Contents",
          "MacOS",
          name.replaceAll(" ", ""),
        ),
        asar: path.join(
          base,
          `${name}.app`,
          "Contents",
          "Resources",
          "app.asar",
        ),
      }
    : {
        executable: path.join(
          base,
          name.replaceAll(" ", "") +
            (process.platform === "win32" ? ".exe" : ""),
        ),
        asar: path.join(base, "resources", "app.asar"),
      };
};
