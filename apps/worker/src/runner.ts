import { claimJob, completeJob, enqueueJob, failJob, releaseStaleJobs, type Db } from "@rebania/db";
import { createSecretBox, type SecretBox } from "@rebania/saas";
import type { JobHandler } from "./handlers.ts";

export interface RunnerOptions {
  db: Db;
  mediaDir?: string;
  workerId: string;
  handlers: Record<string, JobHandler>;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
  secrets?: SecretBox;
  webBaseUrl?: string;
}

/** Processa até esvaziar a fila disponível. Retorna quantos jobs executou. */
export async function drain(
  {
    db,
    workerId,
    handlers,
    mediaDir = "./var/media",
    log = () => {},
    secrets = createSecretBox(null),
    webBaseUrl = "http://localhost:5173",
  }: RunnerOptions,
  max = 100,
): Promise<number> {
  let processed = 0;
  while (processed < max) {
    const job = await claimJob(db, workerId, Object.keys(handlers));
    if (!job) break;
    processed++;
    const handler = handlers[job.queue]!;
    try {
      await handler(
        { db, mediaDir, attempt: job.attempts, maxAttempts: job.max_attempts, secrets, webBaseUrl },
        job.payload,
      );
      await completeJob(db, job.id);
      log("job concluído", { id: job.id, queue: job.queue });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await failJob(db, job, message);
      log("job falhou", { id: job.id, queue: job.queue, attempts: job.attempts, error: message });
    }
  }
  return processed;
}

export async function scheduleRecurring(
  db: Db,
  schedules: { queue: string; everyMs: number }[],
  now = Date.now(),
) {
  for (const s of schedules) {
    const window = Math.floor(now / s.everyMs);
    await enqueueJob(
      db,
      s.queue,
      {},
      { dedupeKey: `${s.queue}:${window}`, runAt: new Date(window * s.everyMs) },
    );
  }
}

export { releaseStaleJobs };
