import { WorkspaceRegistry } from "../src/main/files";
import { WorkspaceWriter } from "../src/main/workspace-lock";
import { Transactions, fileDigest } from "../src/main/transactions";
import path from "node:path";

async function crash() {
  const [root, directory] = process.argv.slice(2);
  const registry = new WorkspaceRegistry();
  const workspace = await registry.select(root);
  const transactions = new Transactions(
    directory,
    registry,
    new WorkspaceWriter(directory, registry, "crash-fixture"),
  );
  const relative = "js/photography-catalog.js";
  await transactions.commit(
    workspace.id,
    workspace.revision,
    "Abrupt process-death fixture",
    [
      {
        relative,
        bytes: Buffer.from("partially installed process-death fixture"),
        expected: await fileDigest(path.join(root, relative)),
      },
      {
        relative: "engineeringdesign.html",
        bytes: Buffer.from("must never install"),
        expected: await fileDigest(path.join(root, "engineeringdesign.html")),
      },
    ],
    () => process.kill(process.pid, "SIGKILL"),
  );
  throw new Error("Crash fixture unexpectedly returned");
}
crash().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
