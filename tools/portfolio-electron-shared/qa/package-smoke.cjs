const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { packagePaths } = require("./package-paths.cjs");
for (const [folder, name] of [
  ["portfolio-studio-electron", "Portfolio Studio"],
  ["photo-processor-electron", "Photo Processor"],
]) {
  const { executable, asar } = packagePaths(folder, name);
  const result = spawnSync(
    executable,
    [
      path.resolve(__dirname, "packaged-worker.cjs"),
      asar,
      path.resolve(__dirname, "../tests/fixtures/synthetic.heic"),
    ],
    {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_PATH: "" },
      stdio: "inherit",
      timeout: 30000,
    },
  );
  if (result.error || result.status !== 0) {
    console.error(result.error || `${name} worker failed: ${result.status}`);
    process.exit(1);
  }
}
