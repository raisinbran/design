import path from "node:path";
import { Worker } from "node:worker_threads";
// On glibc Linux, sharp must load in the main thread before any worker loads it.
import "sharp";
import type { Job, Rendered } from "./render";

const WORKER = path.join(__dirname, "render-worker.cjs");

let running: { worker: Worker; stop: () => void } | null = null;

/**
 * Runs `job` in a new worker thread, so decoding never blocks the main process. Only one job runs:
 * a later job or `cancelJob` terminates this one, which then resolves to null.
 */
export function runJob(job: Job): Promise<Rendered | null> {
  cancelJob();
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER, { workerData: job });
    const entry = { worker, stop: () => resolve(null) };
    running = entry;
    const finish = () => {
      if (running === entry) running = null;
      void worker.terminate();
    };
    worker.once(
      "message",
      (message: { ok: true; value: Rendered } | { ok: false; error: string }) => {
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
