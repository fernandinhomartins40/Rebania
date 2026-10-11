import {
  slaState,
  slaTargets,
  statusAfterMessage,
  TICKET_CHANNELS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from "@rebania/domain";
import type { Prisma } from "@rebania/db";
import { queueEmail } from "@rebania/saas";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../../lib/audit.ts";
import type { AppContext } from "../../lib/context.ts";
import { forbidden, HttpError, notFound } from "../../lib/errors.ts";
import { requireStaff } from "../../lib/staff.ts";
import { staffNames } from "./shared.ts";

type TicketRow = {
  id: string;
  createdAt: Date;
  firstResponseDueAt: Date;
  resolutionDueAt: Date;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
};

export function ticketSla(t: TicketRow, now: Date) {
  return {
    firstResponse: slaState(t.createdAt, t.firstResponseDueAt, t.firstRespondedAt, now),
    resolution: slaState(t.createdAt, t.resolutionDueAt, t.resolvedAt, now),
  };
}

export function supportRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config } = ctx;

  app.get("/v1/platform/tickets", async (req) => {
    const staff = await requireStaff(ctx, req, "customers.read");
    const q = z
      .object({
        status: z.enum([...TICKET_STATUSES, "active"]).default("active"),
        priority: z.enum(TICKET_PRIORITIES).optional(),
        assignee: z.union([z.uuid(), z.literal("me"), z.literal("none")]).optional(),
        orgId: z.uuid().optional(),
      })
      .parse(req.query);
    const where: Prisma.SupportTicketWhereInput = {
      ...(q.status === "active"
        ? { status: { in: ["open", "waiting_customer"] } }
        : { status: q.status }),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.orgId ? { organizationId: q.orgId } : {}),
      ...(q.assignee === "me"
        ? { assigneeUserId: staff.userId }
        : q.assignee === "none"
          ? { assigneeUserId: null }
          : q.assignee
            ? { assigneeUserId: q.assignee }
            : {}),
    };
    const rows = await db.supportTicket.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 300,
      include: {
        organization: { select: { name: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, authorKind: true },
        },
      },
    });
    const names = await staffNames(
      db,
      rows.map((r) => r.assigneeUserId),
    );
    const now = ctx.now();
    return {
      items: rows.map((t) => ({
        id: t.id,
        number: t.number,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        channel: t.channel,
        organizationId: t.organizationId,
        organizationName: t.organization.name,
        assignee: t.assigneeUserId
          ? { id: t.assigneeUserId, name: names.get(t.assigneeUserId) ?? "" }
          : null,
        createdAt: t.createdAt.toISOString(),
        lastMessageAt: t.messages[0]?.createdAt.toISOString() ?? t.createdAt.toISOString(),
        lastMessageBy: t.messages[0]?.authorKind ?? null,
        sla: ticketSla(t, now),
        firstResponseDueAt: t.firstResponseDueAt.toISOString(),
        resolutionDueAt: t.resolutionDueAt.toISOString(),
      })),
    };
  });

  app.get<{ Params: { id: string } }>("/v1/platform/tickets/:id", async (req) => {
    await requireStaff(ctx, req, "customers.read");
    const t = await db.supportTicket.findUnique({
      where: { id: req.params.id },
      include: {
        organization: { select: { id: true, name: true, accessMode: true, stage: true } },
        messages: { orderBy: { createdAt: "asc" } },
        requests: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!t) throw notFound("Chamado");
    const authors = await db.user.findMany({
      where: { id: { in: t.messages.map((m) => m.authorUserId).filter((x): x is string => !!x) } },
      select: { id: true, name: true },
    });
    const byId = new Map(authors.map((a) => [a.id, a.name]));
    const names = await staffNames(db, [t.assigneeUserId, t.openedByUserId]);
    const grants = await db.supportGrant.findMany({
      where: { organizationId: t.organizationId, revokedAt: null, expiresAt: { gt: ctx.now() } },
      select: { id: true, platformUserId: true, expiresAt: true },
    });
    return {
      id: t.id,
      number: t.number,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      channel: t.channel,
      farmId: t.farmId,
      organization: t.organization,
      openedBy: t.openedByUserId
        ? (names.get(t.openedByUserId) ?? byId.get(t.openedByUserId) ?? null)
        : null,
      assignee: t.assigneeUserId
        ? { id: t.assigneeUserId, name: names.get(t.assigneeUserId) ?? "" }
        : null,
      createdAt: t.createdAt.toISOString(),
      firstResponseDueAt: t.firstResponseDueAt.toISOString(),
      resolutionDueAt: t.resolutionDueAt.toISOString(),
      firstRespondedAt: t.firstRespondedAt?.toISOString() ?? null,
      resolvedAt: t.resolvedAt?.toISOString() ?? null,
      sla: ticketSla(t, ctx.now()),
      messages: t.messages.map((m) => ({
        id: m.id,
        authorKind: m.authorKind,
        authorName: m.authorUserId ? (byId.get(m.authorUserId) ?? null) : null,
        body: m.body,
        internal: m.internal,
        channel: m.channel,
        createdAt: m.createdAt.toISOString(),
      })),
      accessRequests: t.requests.map((r) => ({
        id: r.id,
        status: r.status,
        hours: r.hours,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
      })),
      activeGrants: grants.map((g) => ({
        id: g.id,
        platformUserId: g.platformUserId,
        expiresAt: g.expiresAt.toISOString(),
      })),
    };
  });

  /** Atendimento que chegou por outro canal (WhatsApp, e-mail, telefone) vira chamado. */
  app.post<{ Params: { id: string } }>("/v1/platform/customers/:id/tickets", async (req, reply) => {
    const staff = await requireStaff(ctx, req, "support.manage");
    const body = z
      .object({
        subject: z.string().trim().min(3).max(160),
        body: z.string().trim().min(2).max(8000),
        channel: z.enum(TICKET_CHANNELS).exclude(["app"]).default("whatsapp"),
        priority: z.enum(TICKET_PRIORITIES).default("normal"),
      })
      .parse(req.body);
    const org = await db.organization.findUnique({ where: { id: req.params.id } });
    if (!org) throw notFound("Cliente");
    const now = ctx.now();
    const t = await db.$transaction(async (tx) => {
      const t = await tx.supportTicket.create({
        data: {
          organizationId: org.id,
          subject: body.subject,
          priority: body.priority,
          channel: body.channel,
          assigneeUserId: staff.userId,
          ...slaTargets(body.priority, now),
          createdAt: now,
        },
      });
      await tx.supportMessage.create({
        data: {
          organizationId: org.id,
          ticketId: t.id,
          authorKind: "customer",
          body: body.body,
          channel: body.channel,
          createdAt: now,
        },
      });
      await audit(tx, {
        organizationId: org.id,
        actorUserId: staff.userId,
        action: "ticket.registered",
        entityType: "support_ticket",
        entityId: t.id,
        data: { channel: body.channel },
      });
      return t;
    });
    return reply.status(201).send({ id: t.id, number: t.number });
  });

  app.post<{ Params: { id: string } }>("/v1/platform/tickets/:id/messages", async (req, reply) => {
    const staff = await requireStaff(ctx, req, "support.manage");
    const body = z
      .object({
        body: z.string().trim().min(1).max(8000),
        internal: z.boolean().default(false),
        channel: z.enum(TICKET_CHANNELS).optional(),
        /** Mensagem do cliente recebida por outro canal e registrada pela equipe. */
        fromCustomer: z.boolean().default(false),
      })
      .parse(req.body);
    const t = await db.supportTicket.findUnique({
      where: { id: req.params.id },
      include: { organization: { select: { name: true } } },
    });
    if (!t) throw notFound("Chamado");
    const now = ctx.now();
    const author = body.fromCustomer ? "customer" : "staff";
    const next = statusAfterMessage(t.status, author, body.internal);
    const m = await db.$transaction(async (tx) => {
      const m = await tx.supportMessage.create({
        data: {
          organizationId: t.organizationId,
          ticketId: t.id,
          authorUserId: body.fromCustomer ? null : staff.userId,
          authorKind: author,
          body: body.body,
          internal: body.internal,
          channel: body.channel ?? null,
          createdAt: now,
        },
      });
      await tx.supportTicket.update({
        where: { id: t.id },
        data: {
          status: next,
          ...(author === "staff" && !body.internal && !t.firstRespondedAt
            ? { firstRespondedAt: now }
            : {}),
          ...(next === "open" ? { resolvedAt: null, closedAt: null } : {}),
          ...(t.assigneeUserId ? {} : { assigneeUserId: staff.userId }),
        },
      });
      if (author === "staff" && !body.internal && t.openedByUserId) {
        const opener = await tx.user.findUnique({ where: { id: t.openedByUserId } });
        if (opener && !opener.disabledAt)
          await queueEmail(tx, {
            to: opener.email,
            template: "ticket_reply",
            baseUrl: config.webBaseUrl,
            organizationId: t.organizationId,
            data: {
              number: t.number,
              subject: t.subject,
              excerpt: body.body.length > 600 ? `${body.body.slice(0, 600)}…` : body.body,
              url: `${config.webBaseUrl}/fazenda/suporte/${t.id}`,
            },
          });
      }
      return m;
    });
    return reply.status(201).send({ id: m.id, status: next });
  });

  app.patch<{ Params: { id: string } }>("/v1/platform/tickets/:id", async (req) => {
    const staff = await requireStaff(ctx, req, "support.manage");
    const body = z
      .object({
        status: z.enum(TICKET_STATUSES).optional(),
        priority: z.enum(TICKET_PRIORITIES).optional(),
        assigneeUserId: z.uuid().nullable().optional(),
      })
      .parse(req.body);
    const t = await db.supportTicket.findUnique({ where: { id: req.params.id } });
    if (!t) throw notFound("Chamado");
    if (
      body.assigneeUserId &&
      !(await db.platformAdmin.findUnique({ where: { userId: body.assigneeUserId } }))
    )
      throw new HttpError(422, "invalid_staff", "Responsável precisa ser da equipe Rebania.");
    const now = ctx.now();
    const data: Prisma.SupportTicketUpdateInput = {};
    if (body.priority && body.priority !== t.priority)
      Object.assign(data, { priority: body.priority }, slaTargets(body.priority, t.createdAt));
    if (body.assigneeUserId !== undefined) data.assigneeUserId = body.assigneeUserId;
    if (body.status && body.status !== t.status) {
      data.status = body.status;
      if (body.status === "resolved") data.resolvedAt = now;
      if (body.status === "closed") {
        data.closedAt = now;
        if (!t.resolvedAt) data.resolvedAt = now;
      }
      if (body.status === "open") Object.assign(data, { resolvedAt: null, closedAt: null });
    }
    await db.$transaction(async (tx) => {
      await tx.supportTicket.update({ where: { id: t.id }, data });
      if (body.status && body.status !== t.status)
        await tx.supportMessage.create({
          data: {
            organizationId: t.organizationId,
            ticketId: t.id,
            authorKind: "system",
            authorUserId: staff.userId,
            body: `Situação alterada para "${body.status}".`,
            internal: true,
            createdAt: now,
          },
        });
      await audit(tx, {
        organizationId: t.organizationId,
        actorUserId: staff.userId,
        action: "ticket.update",
        entityType: "support_ticket",
        entityId: t.id,
        data: { from: { status: t.status, priority: t.priority }, ...body },
      });
    });
    return { ok: true };
  });

  // ---- Pedido de acesso de suporte (o proprietário decide no app) ----
  app.post<{ Params: { id: string } }>(
    "/v1/platform/customers/:id/access-requests",
    async (req, reply) => {
      const staff = await requireStaff(ctx, req, "support.manage");
      const body = z
        .object({
          reason: z.string().trim().min(10).max(300),
          hours: z.number().int().min(1).max(72),
          ticketId: z.uuid().optional(),
        })
        .parse(req.body);
      const org = await db.organization.findUnique({ where: { id: req.params.id } });
      if (!org) throw notFound("Cliente");
      if (body.ticketId) {
        const t = await db.supportTicket.findFirst({
          where: { id: body.ticketId, organizationId: org.id },
        });
        if (!t) throw notFound("Chamado");
      }
      const pending = await db.supportAccessRequest.findFirst({
        where: { organizationId: org.id, platformUserId: staff.userId, status: "pending" },
      });
      if (pending)
        throw new HttpError(
          409,
          "request_pending",
          "Já existe um pedido seu aguardando o proprietário.",
        );
      const staffUser = await db.user.findUniqueOrThrow({ where: { id: staff.userId } });
      const r = await db.$transaction(async (tx) => {
        const r = await tx.supportAccessRequest.create({
          data: {
            organizationId: org.id,
            platformUserId: staff.userId,
            ticketId: body.ticketId ?? null,
            reason: body.reason,
            hours: body.hours,
          },
        });
        if (body.ticketId)
          await tx.supportMessage.create({
            data: {
              organizationId: org.id,
              ticketId: body.ticketId,
              authorKind: "system",
              authorUserId: staff.userId,
              body: `A equipe pediu acesso de leitura por ${body.hours} h. O proprietário aprova em Fazenda → Plano e créditos → Acesso de suporte.`,
              internal: false,
            },
          });
        const owners = await tx.membership.findMany({
          where: {
            organizationId: org.id,
            role: "owner",
            revokedAt: null,
            user: { disabledAt: null },
          },
          select: { user: { select: { email: true } } },
        });
        for (const o of owners)
          await queueEmail(tx, {
            to: o.user.email,
            template: "support_access_request",
            baseUrl: config.webBaseUrl,
            organizationId: org.id,
            data: {
              organizationName: org.name,
              staffName: staffUser.name,
              hours: body.hours,
              reason: body.reason,
              url: `${config.webBaseUrl}/fazenda/plano`,
            },
          });
        await audit(tx, {
          organizationId: org.id,
          actorUserId: staff.userId,
          action: "support.access_requested",
          entityType: "support_access_request",
          entityId: r.id,
          data: { hours: body.hours },
        });
        return r;
      });
      return reply.status(201).send({ id: r.id });
    },
  );

  app.post<{ Params: { id: string } }>("/v1/platform/access-requests/:id/cancel", async (req) => {
    const staff = await requireStaff(ctx, req, "support.manage");
    const r = await db.supportAccessRequest.updateMany({
      where: { id: req.params.id, platformUserId: staff.userId, status: "pending" },
      data: { status: "cancelled", decidedAt: ctx.now() },
    });
    if (!r.count) throw notFound("Pedido");
    return { ok: true };
  });

  /** Leitura de suporte: só com concessão ativa do proprietário; cada acesso é auditado. */
  app.get<{ Params: { orgId: string; farmId: string } }>(
    "/v1/platform/support/:orgId/farms/:farmId/summary",
    async (req) => {
      const staff = await requireStaff(ctx, req, "support.manage");
      const g = await db.supportGrant.findFirst({
        where: {
          organizationId: req.params.orgId,
          platformUserId: staff.userId,
          revokedAt: null,
          expiresAt: { gt: ctx.now() },
        },
      });
      if (!g) throw forbidden();
      const farm = await db.farm.findFirst({
        where: { id: req.params.farmId, organizationId: req.params.orgId },
      });
      if (!farm) throw notFound("Fazenda");
      await audit(db, {
        organizationId: farm.organizationId,
        farmId: farm.id,
        actorUserId: staff.userId,
        action: "support.read",
        entityType: "farm",
        entityId: farm.id,
        data: { grantId: g.id },
      });
      const [animals, pendingSync, openTasks] = await Promise.all([
        db.animal.groupBy({ by: ["status"], where: { farmId: farm.id }, _count: { _all: true } }),
        db.syncMutation.count({
          where: {
            farmId: farm.id,
            OR: [
              { receipt: { path: ["status"], equals: "rejected" } },
              { receipt: { path: ["status"], equals: "conflict" } },
            ],
          },
        }),
        db.task.count({ where: { farmId: farm.id, status: "open" } }),
      ]);
      return {
        farm: { id: farm.id, name: farm.name, timezone: farm.timezone },
        animalsByStatus: Object.fromEntries(animals.map((a) => [a.status, a._count._all])),
        rejectedOrConflictMutations: pendingSync,
        openTasks,
        grantExpiresAt: g.expiresAt.toISOString(),
      };
    },
  );
}
