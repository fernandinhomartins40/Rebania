import type { Db } from "@rebania/db";

export type JobHandler = (db: Db, payload: unknown) => Promise<void>;

/**
 * Handlers por fila. Jobs pesados (vídeo, OCR) NÃO rodam aqui por padrão
 * (MN §12: worker limitado, sem processamento pesado local).
 */
export const handlers: Record<string, JobHandler> = {
  /** Remove sessões expiradas/revogadas há mais de 30 dias (não são histórico de negócio). */
  "maintenance.sessions": async (db) => {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600_000);
    await db.authSession.deleteMany({
      where: {
        OR: [
          { revokedAt: { lt: cutoff } },
          { channel: "web", accessExpiresAt: { lt: cutoff } },
          { channel: "mobile", refreshExpiresAt: { lt: cutoff } },
        ],
      },
    });
  },
  /** Recibos de sync antigos: mantidos 180 dias para cobrir aparelhos muito tempo offline. */
  "maintenance.sync-receipts": async (db) => {
    const cutoff = new Date(Date.now() - 180 * 24 * 3600_000);
    await db.syncMutation.deleteMany({ where: { createdAt: { lt: cutoff } } });
  },
};

/** Agendamentos periódicos: um job por janela, deduplicado por chave. */
export const schedules: { queue: string; everyMs: number }[] = [
  { queue: "maintenance.sessions", everyMs: 24 * 3600_000 },
  { queue: "maintenance.sync-receipts", everyMs: 24 * 3600_000 },
];
