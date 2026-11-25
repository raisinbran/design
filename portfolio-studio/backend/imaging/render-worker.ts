import { parentPort, workerData } from "node:worker_threads";
import { analyzeJob, levelJob, measureJob, renderJob, type Job } from "./render";

const job = workerData as Job;
const task =
  job.kind === "appearance"
    ? analyzeJob(job)
    : job.kind === "measure"
      ? measureJob(job)
      : job.kind === "level"
        ? levelJob(job)
        : renderJob(job);
task.then(
  (value) => parentPort!.postMessage({ ok: true, value }),
  (error: unknown) => parentPort!.postMessage({ ok: false, error: String(error) }),
);
