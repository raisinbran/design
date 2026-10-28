const { readdirSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
// Run each file directly so tsx and Node's nested test runner report every assertion suite.
let failed = false;
for (const name of readdirSync(__dirname)
  .filter((name) => name.endsWith(".test.ts"))
  .sort()) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", path.join(__dirname, name)],
    { stdio: "inherit" },
  );
  if (result.error) console.error(result.error);
  if (result.error || result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
