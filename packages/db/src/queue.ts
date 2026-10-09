import type { Prisma, PrismaClient } from "./generated/client.ts";

type Client = PrismaClient | Prisma.TransactionClient;

export interface EnqueueOptions {
  runAt?: Date;
  maxAttempts?: number;
  /** Evita duplicar jobs equivalentes (ex.: agendamentos periódicos). */
  dedupeKey?: string;
}

/** Enfileira um job. Pode ser chamado dentro da mesma transação da escrita de negócio. */
export async function enqueueJob(
  db: Client,
  queue: string,
  payload: Prisma.InputJsonValue = {},
  opts: EnqueueOptions = {},
) {
  if (opts.dedupeKey) {
    const existing = await db.job.findUnique({ where: { dedupeKey: opts.dedupeKey } });
    if (existing) return existing;
  }
  return db.job.create({
    data: {
      queue,
      payload,
      runAt: opts.runAt ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 5,
      dedupeKey: opts.dedupeKey ?? null,
    },
  });
}

export interface ClaimedJob {
  id: string;
  queue: string;
  payload: Prisma.JsonValue;
  attempts: number;
  max_attempts: number;
}

/** Reserva o próximo job disponível com FOR UPDATE SKIP LOCKED (seguro com vários workers). */
export async function claimJob(
  db: PrismaClient,
  workerId: string,
  queues: string[],
): Promise<ClaimedJob | null> {
  const rows = await db.$queryRaw<ClaimedJob[]>`
    UPDATE jobs SET status = 'running', locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'queued' AND run_at <= now() AND queue = ANY(${queues})
      ORDER BY run_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, queue, payload, attempts, max_attempts`;
  return rows[0] ?? null;
}

export async function completeJob(db: PrismaClient, id: string) {
  await db.job.update({
    where: { id },
    data: { status: "done", finishedAt: new Date(), lockedAt: null },
  });
}

/** Falha: reagenda com backoff exponencial até `maxAttempts`, depois marca como failed. */
export async function failJob(db: PrismaClient, job: ClaimedJob, error: string) {
  const exhausted = job.attempts >= job.max_attempts;
  const delayMs = Math.min(3600_000, 5_000 * 2 ** (job.attempts - 1));
  await db.job.update({
    where: { id: job.id },
    data: exhausted
      ? {
          status: "failed",
          lastError: error.slice(0, 2000),
          finishedAt: new Date(),
          lockedAt: null,
        }
      : {
          status: "queued",
          lastError: error.slice(0, 2000),
          runAt: new Date(Date.now() + delayMs),
          lockedAt: null,
        },
  });
}

/** Devolve à fila jobs presos (worker morreu durante a execução). */
export async function releaseStaleJobs(db: PrismaClient, olderThanMs = 10 * 60_000) {
  return db.job.updateMany({
    where: { status: "running", lockedAt: { lt: new Date(Date.now() - olderThanMs) } },
    data: { status: "queued", lockedAt: null, lockedBy: null },
  });
}
