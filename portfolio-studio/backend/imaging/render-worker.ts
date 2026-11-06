import { parentPort, workerData } from "node:worker_threads";
import { renderJob, type Job } from "./render";

renderJob(workerData as Job).then(
  (value) => parentPort!.postMessage({ ok: true, value }),
  (error: unknown) => parentPort!.postMessage({ ok: false, error: String(error) }),
);
