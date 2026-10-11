import type { Db } from "@rebania/db";
import { deriveVariants } from "@rebania/media";
import {
  deliverEmail,
  markEmailFailed,
  MAIL_QUEUE,
  runBillingCycle,
  type SecretBox,
} from "@rebania/saas";

export interface JobContext {
  db: Db;
  mediaDir: string;
  /** Tentativa atual e limite do job (para tratar a última falha). */
  attempt: number;
  maxAttempts: number;
  secrets: SecretBox;
  webBaseUrl: string;
}

export type JobHandler = (ctx: JobContext, payload: unknown) => Promise<void>;

/**
 * Handlers por fila. Jobs pesados (vídeo, OCR) NÃO rodam aqui por padrão
 * (MN §12: worker limitado, sem processamento pesado local).
 */
export const handlers: Record<string, JobHandler> = {
  /** Remove sessões expiradas/revogadas há mais de 30 dias (não são histórico de negócio). */
  /** Gera miniatura/exibição em WebP e original saneado (sem EXIF/GPS). */
  "media.derive": async ({ db, mediaDir }, payload) => {
    const { attachmentId } = payload as { attachmentId: string };
    const a = await db.attachment.findUnique({ where: { id: attachmentId } });
    if (!a || a.status !== "processing" || a.deletedAt) return;
    try {
      const dims = await deriveVariants(mediaDir, {
        organizationId: a.organizationId,
        farmId: a.farmId,
        attachmentId: a.id,
      });
      await db.$transaction(async (tx) => {
        await tx.attachment.update({
          where: { id: a.id },
          data: {
            status: "ready",
            readyAt: new Date(),
            width: dims.width ?? null,
            height: dims.height ?? null,
          },
        });
        if (a.animalId) {
          await tx.changeLog.create({
            data: {
              organizationId: a.organizationId,
              farmId: a.farmId,
              entity: "animal",
              entityId: a.animalId,
            },
          });
        }
      });
    } catch (err) {
      await db.attachment.update({
        where: { id: a.id },
        data: {
          status: "failed",
          failureReason: err instanceof Error ? err.message.slice(0, 300) : "falha",
        },
      });
    }
  },
  "maintenance.sessions": async ({ db }) => {
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
  "maintenance.sync-receipts": async ({ db }) => {
    const cutoff = new Date(Date.now() - 180 * 24 * 3600_000);
    await db.syncMutation.deleteMany({ where: { createdAt: { lt: cutoff } } });
  },
  /** E-mail transacional pelo VeloMail; na última tentativa o e-mail fica como falho. */
  [MAIL_QUEUE]: async ({ db, secrets, attempt, maxAttempts }, payload) => {
    const { emailId } = payload as { emailId: string };
    try {
      await deliverEmail(db, secrets, emailId);
    } catch (err) {
      if (attempt >= maxAttempts)
        await markEmailFailed(db, emailId, err instanceof Error ? err.message : String(err));
      throw err;
    }
  },
  /** Ciclo de cobrança: emite mensalidades, régua de lembretes e modo de acesso (idempotente). */
  "billing.daily": async ({ db, webBaseUrl }) => {
    await runBillingCycle(db, new Date(), webBaseUrl);
  },
};

/** Agendamentos periódicos: um job por janela, deduplicado por chave. */
export const schedules: { queue: string; everyMs: number }[] = [
  { queue: "maintenance.sessions", everyMs: 24 * 3600_000 },
  { queue: "maintenance.sync-receipts", everyMs: 24 * 3600_000 },
  // A cada 6 h: um dia sem execução (deploy, queda) não atrasa a régua.
  { queue: "billing.daily", everyMs: 6 * 3600_000 },
];
