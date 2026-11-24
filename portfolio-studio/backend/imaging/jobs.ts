import path from "node:path";
import { Worker } from "node:worker_threads";
// On glibc Linux, sharp must load in the main thread before any worker loads it.
import "sharp";
import type { AppearanceMap, Job, Leveled, Rendered } from "./render";

const WORKER = path.join(__dirname, "render-worker.cjs");

let running: { worker: Worker; stop: () => void } | null = null;

/**
 * Runs `job` in a new worker thread, so decoding never blocks the main process. Only one job runs
 * at a time. A later job or `cancelJob` terminates this one, which then resolves to null.
 */
type JobResult<J extends Job> = J extends { kind: "appearance" }
  ? AppearanceMap
  : J extends { kind: "level" }
    ? Leveled
    : Rendered;

export function runJob<J extends Job>(job: J): Promise<JobResult<J> | null> {
  cancelJob();
  return new Promise<JobResult<J> | null>((resolve, reject) => {
    const worker = new Worker(WORKER, { workerData: job });
    const entry = { worker, stop: () => resolve(null) };
    running = entry;
    const finish = () => {
      if (running === entry) running = null;
      void worker.terminate();
    };
    worker.once(
      "message",
      (message: { ok: true; value: JobResult<J> } | { ok: false; error: string }) => {
        finish();
        if (message.ok) resolve(message.value);
        else reject(new Error(message.error));
      },
    );
    worker.once("error", (error) => {
      finish();
      reject(error);
    });
    worker.once("exit", () => {
      finish();
      reject(new Error("The image worker stopped without an answer"));
    });
  });
}

export function cancelJob(): void {
  if (!running) return;
  const { worker, stop } = running;
  running = null;
  stop();
  void worker.terminate();
}
