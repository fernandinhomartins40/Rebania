import { enqueueJob } from "@rebania/db";
import { getMailSettings, MAIL_QUEUE, secretStatus, SECRET_KEYS } from "@rebania/saas";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../../lib/audit.ts";
import type { AppContext } from "../../lib/context.ts";
import { HttpError, notFound } from "../../lib/errors.ts";
import { requireStaff } from "../../lib/staff.ts";
import { civilToDate } from "../../lib/dates.ts";
import { today } from "./shared.ts";

export interface Alert {
  severity: "critical" | "warning" | "info";
  key: string;
  title: string;
  detail: string;
  href?: string;
}

const H = 3_600_000;

/** Saúde medida pelo próprio sistema (sem inventar o que não é medido aqui, como disco). */
export async function systemHealth(ctx: AppContext) {
  const { db } = ctx;
  const now = ctx.now();
  const since = new Date(now.getTime() - 24 * H);
  const [
    queued,
    oldestQueued,
    running,
    failedByQueue,
    recentFailures,
    emailByStatus,
    failedEmails,
    syncProblems,
    unprocessedPayments,
    stuckMedia,
    dbSize,
    mail,
    key,
  ] = await Promise.all([
    db.job.count({ where: { status: "queued", runAt: { lte: now } } }),
    db.job.findFirst({
      where: { status: "queued", runAt: { lte: now } },
      orderBy: { runAt: "asc" },
      select: { runAt: true },
    }),
    db.job.count({ where: { status: "running" } }),
    db.job.groupBy({
      by: ["queue"],
      where: { status: "failed", finishedAt: { gte: since } },
      _count: { _all: true },
    }),
    db.job.findMany({
      where: { status: "failed" },
      orderBy: { finishedAt: "desc" },
      take: 10,
      select: { id: true, queue: true, lastError: true, finishedAt: true, attempts: true },
    }),
    db.emailMessage.groupBy({
      by: ["status"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    db.emailMessage.findMany({
      where: { status: { in: ["failed", "bounced"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, toEmail: true, template: true, error: true, createdAt: true },
    }),
    db.syncMutation.count({
      where: {
        createdAt: { gte: since },
        OR: [
          { receipt: { path: ["status"], equals: "rejected" } },
          { receipt: { path: ["status"], equals: "conflict" } },
        ],
      },
    }),
    db.paymentEvent.count({ where: { processedAt: null } }),
    db.attachment.count({
      where: {
        status: "processing",
        deletedAt: null,
        createdAt: { lt: new Date(now.getTime() - H) },
      },
    }),
    db.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`,
    getMailSettings(db),
    secretStatus(db, SECRET_KEYS.velomailApiKey),
  ]);
  return {
    version: ctx.config.appVersion,
    uptimeSeconds: Math.round(process.uptime()),
    node: process.version,
    databaseBytes: Number(dbSize[0]?.size ?? 0),
    secretsKeyConfigured: Boolean(ctx.secrets?.available),
    mail: { enabled: mail.enabled, fromEmail: mail.fromEmail, apiKeyConfigured: key.configured },
    jobs: {
      queued,
      running,
      oldestQueuedMinutes: oldestQueued
        ? Math.round((now.getTime() - oldestQueued.runAt.getTime()) / 60_000)
        : 0,
      failed24h: failedByQueue.map((f) => ({ queue: f.queue, count: f._count._all })),
      recentFailures: recentFailures.map((j) => ({
        id: j.id,
        queue: j.queue,
        error: j.lastError,
        attempts: j.attempts,
        at: j.finishedAt?.toISOString() ?? null,
      })),
    },
    email24h: Object.fromEntries(emailByStatus.map((e) => [e.status, e._count._all])),
    recentEmailFailures: failedEmails.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    syncProblems24h: syncProblems,
    unprocessedPayments,
    stuckMedia,
  };
}

export async function computeAlerts(ctx: AppContext): Promise<Alert[]> {
  const h = await systemHealth(ctx);
  const t = today(ctx);
  const { db } = ctx;
  const [overdueInvoices, readOnly, breached, unassigned, overdueSteps] = await Promise.all([
    db.invoice.count({
      where: {
        status: { in: ["pending", "failed"] },
        dueOn: { lt: civilToDate(t) },
        organization: { isDemo: false },
      },
    }),
    db.organization.count({ where: { accessMode: "read_only", isDemo: false } }),
    db.supportTicket.count({
      where: {
        status: { in: ["open", "waiting_customer"] },
        OR: [
          { firstRespondedAt: null, firstResponseDueAt: { lt: ctx.now() } },
          { resolvedAt: null, resolutionDueAt: { lt: ctx.now() } },
        ],
      },
    }),
    db.supportTicket.count({ where: { status: "open", assigneeUserId: null } }),
    db.onboardingStep.count({
      where: { status: { in: ["todo", "doing"] }, dueOn: { lt: civilToDate(t) } },
    }),
  ]);
  const alerts: Alert[] = [];
  const failed = h.jobs.failed24h.reduce((a, f) => a + f.count, 0);
  if (!h.secretsKeyConfigured)
    alerts.push({
      severity: "warning",
      key: "secrets_key",
      title: "Cofre do console sem chave",
      detail:
        "Defina PLATFORM_SECRETS_KEY no servidor para ligar o e-mail e a verificação em duas etapas da equipe.",
      href: "/console/configuracoes",
    });
  if (!h.mail.enabled || !h.mail.apiKeyConfigured)
    alerts.push({
      severity: "warning",
      key: "mail_off",
      title: "E-mail transacional desligado",
      detail: "Convites, régua de cobrança e redefinição de senha não saem por e-mail.",
      href: "/console/configuracoes",
    });
  if (failed)
    alerts.push({
      severity: "critical",
      key: "jobs_failed",
      title: `${failed} tarefa(s) do worker falharam em 24 h`,
      detail: h.jobs.failed24h.map((f) => `${f.queue}: ${f.count}`).join(" · "),
      href: "/console/operacao",
    });
  if (h.jobs.oldestQueuedMinutes > 15)
    alerts.push({
      severity: "critical",
      key: "queue_stuck",
      title: "Fila do worker parada",
      detail: `Tarefa aguardando há ${h.jobs.oldestQueuedMinutes} min. Verifique o contêiner do worker.`,
      href: "/console/operacao",
    });
  if ((h.email24h.failed ?? 0) + (h.email24h.bounced ?? 0) > 0)
    alerts.push({
      severity: "warning",
      key: "email_failed",
      title: "E-mails não entregues",
      detail: `${(h.email24h.failed ?? 0) + (h.email24h.bounced ?? 0)} falha(s) em 24 h.`,
      href: "/console/operacao",
    });
  if (h.unprocessedPayments)
    alerts.push({
      severity: "warning",
      key: "payments",
      title: "Eventos de pagamento pendentes",
      detail: `${h.unprocessedPayments} evento(s) recebidos sem processamento.`,
      href: "/console/operacao",
    });
  if (h.stuckMedia)
    alerts.push({
      severity: "info",
      key: "media",
      title: "Fotos presas no processamento",
      detail: `${h.stuckMedia} anexo(s) há mais de 1 h.`,
      href: "/console/operacao",
    });
  if (h.syncProblems24h > 20)
    alerts.push({
      severity: "info",
      key: "sync",
      title: "Muitas rejeições de sincronização",
      detail: `${h.syncProblems24h} registros rejeitados ou em conflito em 24 h.`,
      href: "/console/operacao",
    });
  if (breached)
    alerts.push({
      severity: "critical",
      key: "sla",
      title: `${breached} chamado(s) com prazo estourado`,
      detail: "Responda ou repriorize na fila de suporte.",
      href: "/console/suporte",
    });
  if (unassigned)
    alerts.push({
      severity: "warning",
      key: "unassigned",
      title: `${unassigned} chamado(s) sem responsável`,
      detail: "Atribua alguém da equipe.",
      href: "/console/suporte",
    });
  if (overdueInvoices)
    alerts.push({
      severity: "warning",
      key: "overdue",
      title: `${overdueInvoices} fatura(s) vencida(s)`,
      detail: readOnly
        ? `${readOnly} cliente(s) em somente leitura.`
        : "A régua de cobrança está acompanhando.",
      href: "/console/cobranca",
    });
  if (overdueSteps)
    alerts.push({
      severity: "info",
      key: "onboarding",
      title: `${overdueSteps} etapa(s) de implantação atrasada(s)`,
      detail: "Veja o quadro de implantações.",
      href: "/console/implantacoes",
    });
  return alerts;
}

const AnnouncementBody = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(2000),
  level: z.enum(["info", "warning", "maintenance"]).default("info"),
  organizationIds: z.array(z.uuid()).max(500).default([]),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable().optional(),
});

export function opsRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  app.get("/v1/platform/ops", async (req) => {
    await requireStaff(ctx, req, "ops.read");
    const [health, alerts] = await Promise.all([systemHealth(ctx), computeAlerts(ctx)]);
    return { ...health, alerts };
  });

  // ---- E-mails enviados ----
  app.get("/v1/platform/emails", async (req) => {
    await requireStaff(ctx, req, "ops.read");
    const q = z
      .object({
        status: z.enum(["queued", "sent", "delivered", "failed", "bounced", "skipped"]).optional(),
        orgId: z.uuid().optional(),
      })
      .parse(req.query);
    const rows = await db.emailMessage.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.orgId ? { organizationId: q.orgId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        organizationId: true,
        toEmail: true,
        subject: true,
        template: true,
        status: true,
        error: true,
        attempts: true,
        createdAt: true,
        sentAt: true,
        deliveredAt: true,
      },
    });
    return {
      items: rows.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
        sentAt: e.sentAt?.toISOString() ?? null,
        deliveredAt: e.deliveredAt?.toISOString() ?? null,
      })),
    };
  });

  app.post<{ Params: { id: string } }>("/v1/platform/emails/:id/retry", async (req) => {
    const staff = await requireStaff(ctx, req, "settings.manage");
    const e = await db.emailMessage.findUnique({ where: { id: req.params.id } });
    if (!e) throw notFound("E-mail");
    if (!["failed", "skipped", "bounced"].includes(e.status))
      throw new HttpError(
        409,
        "email_not_retryable",
        "Só e-mails falhos ou não enviados podem ser reenviados.",
      );
    await db.$transaction(async (tx) => {
      await tx.emailMessage.update({
        where: { id: e.id },
        data: { status: "queued", error: null },
      });
      await enqueueJob(tx, MAIL_QUEUE, { emailId: e.id }, { maxAttempts: 8 });
      await audit(tx, {
        organizationId: e.organizationId,
        actorUserId: staff.userId,
        action: "email.retry",
        entityType: "email",
        entityId: e.id,
      });
    });
    return { ok: true };
  });

  // ---- Comunicados aos clientes ----
  app.get("/v1/platform/announcements", async (req) => {
    await requireStaff(ctx, req, "customers.read");
    const rows = await db.announcement.findMany({ orderBy: { startsAt: "desc" }, take: 100 });
    const now = ctx.now();
    return {
      items: rows.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        level: a.level,
        organizationIds: a.organizationIds,
        startsAt: a.startsAt.toISOString(),
        endsAt: a.endsAt?.toISOString() ?? null,
        archived: a.archivedAt !== null,
        live: !a.archivedAt && a.startsAt <= now && (!a.endsAt || a.endsAt > now),
      })),
    };
  });

  app.post("/v1/platform/announcements", async (req, reply) => {
    const staff = await requireStaff(ctx, req, "announcements.manage");
    const body = AnnouncementBody.parse(req.body);
    if (body.endsAt && body.endsAt <= body.startsAt)
      throw new HttpError(422, "invalid_period", "O fim precisa ser depois do início.");
    const a = await db.announcement.create({
      data: {
        title: body.title,
        body: body.body,
        level: body.level,
        organizationIds: body.organizationIds,
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        createdById: staff.userId,
      },
    });
    await audit(db, {
      actorUserId: staff.userId,
      action: "announcement.create",
      entityType: "announcement",
      entityId: a.id,
      data: { level: body.level, audience: body.organizationIds.length || "all" },
    });
    return reply.status(201).send({ id: a.id });
  });

  app.post<{ Params: { id: string } }>("/v1/platform/announcements/:id/archive", async (req) => {
    const staff = await requireStaff(ctx, req, "announcements.manage");
    const r = await db.announcement.updateMany({
      where: { id: req.params.id, archivedAt: null },
      data: { archivedAt: ctx.now() },
    });
    if (!r.count) throw notFound("Comunicado");
    await audit(db, {
      actorUserId: staff.userId,
      action: "announcement.archive",
      entityType: "announcement",
      entityId: req.params.id,
    });
    return { ok: true };
  });
}
