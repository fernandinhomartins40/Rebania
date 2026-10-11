import { roleHas, slaTargets, statusAfterMessage, TICKET_PRIORITY_LABEL } from "@rebania/domain";
import { getBillingSettings, getMailSettings, queueEmail } from "@rebania/saas";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../lib/audit.ts";
import { resolveBilling } from "../lib/billing.ts";
import type { AppContext } from "../lib/context.ts";
import { balanceOf } from "../lib/credits.ts";
import { dateToCivil } from "../lib/dates.ts";
import { HttpError, notFound } from "../lib/errors.ts";
import { requireOrg } from "../lib/tenant.ts";
import { requireAuth } from "../plugins/auth.ts";
import {
  capacityFor,
  contractTerms,
  orgUsage,
  serializeInvoice,
  today,
} from "./platform/shared.ts";

/**
 * Lado do cliente da operação SaaS: plano e faturas (T05), créditos (T06), chamados,
 * acesso de suporte (concessões e pedidos da equipe) e comunicados.
 */
export function customerRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config } = ctx;
  const billing = resolveBilling(ctx);

  // ---- Plano: contrato, capacidade, faturas e como pagar ----
  app.get<{ Params: { orgId: string } }>("/v1/orgs/:orgId/plan", async (req) => {
    const org = await requireOrg(db, requireAuth(req).userId, req.params.orgId, "org.manage");
    const t = today(ctx);
    const [o, contract, invoices, settings, usage] = await Promise.all([
      db.organization.findUniqueOrThrow({ where: { id: org.organizationId } }),
      db.contract.findFirst({
        where: { organizationId: org.organizationId, status: { in: ["active", "suspended"] } },
        orderBy: { createdAt: "desc" },
        include: { amendments: true },
      }),
      db.invoice.findMany({
        where: { organizationId: org.organizationId, status: { not: "cancelled" } },
        orderBy: { dueOn: "desc" },
        take: 24,
      }),
      getBillingSettings(db),
      orgUsage(db, org.organizationId),
    ]);
    const terms = contract ? contractTerms(contract, t) : null;
    return {
      access: { mode: o.accessMode, reason: o.accessReason },
      contract: contract
        ? {
            plan: contract.plan,
            status: contract.status,
            implementationCents:
              contract.implementationCents === null ? null : Number(contract.implementationCents),
            monthlyCents: terms?.monthlyCents ?? null,
            startsOn: dateToCivil(contract.startsOn),
            endsOn: dateToCivil(contract.endsOn),
            billingDay: contract.billingDay,
          }
        : null,
      capacity: contract ? capacityFor(terms?.limits ?? null, usage) : [],
      paymentInstructions: settings.paymentInstructions,
      invoices: invoices.map((i) => {
        const s = serializeInvoice(i, t);
        return {
          id: s.id,
          description: s.description,
          kind: s.kind,
          amountCents: s.amountCents,
          dueOn: s.dueOn,
          status: s.status,
          displayStatus: s.displayStatus,
          paidAt: s.paidAt,
          paymentUrl: s.paymentUrl,
        };
      }),
    };
  });

  // ---- Créditos ----
  app.get<{ Params: { orgId: string } }>("/v1/orgs/:orgId/credits", async (req) => {
    const org = await requireOrg(db, requireAuth(req).userId, req.params.orgId, "org.manage");
    const [ledger, packages] = await Promise.all([
      db.creditLedger.findMany({
        where: { organizationId: org.organizationId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.creditPackage.findMany({ where: { archivedAt: null }, orderBy: { credits: "asc" } }),
    ]);
    return {
      balance: await balanceOf(db, org.organizationId),
      purchaseAvailable: Boolean(billing) && packages.length > 0,
      purchaseUnavailableReason: !billing
        ? "Pagamento online ainda não configurado. Fale com a equipe Rebania para adquirir créditos."
        : packages.length === 0
          ? "Pacotes de créditos ainda não definidos."
          : null,
      packages: packages.map((p) => ({
        id: p.id,
        name: p.name,
        credits: p.credits,
        priceCents: Number(p.priceCents),
      })),
      ledger: ledger.map((l) => ({
        id: l.id,
        kind: l.kind,
        amount: l.amount,
        balanceAfter: l.balanceAfter,
        note: l.note,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  });

  // ---- Acesso de suporte: concessões do proprietário ----
  app.get<{ Params: { orgId: string } }>("/v1/orgs/:orgId/support-grants", async (req) => {
    const org = await requireOrg(db, requireAuth(req).userId, req.params.orgId, "org.manage");
    const rows = await db.supportGrant.findMany({
      where: { organizationId: org.organizationId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const now = ctx.now();
    return {
      items: rows.map((g) => ({
        id: g.id,
        reason: g.reason,
        expiresAt: g.expiresAt.toISOString(),
        active: !g.revokedAt && g.expiresAt > now,
        revokedAt: g.revokedAt?.toISOString() ?? null,
      })),
    };
  });

  app.post<{ Params: { orgId: string } }>("/v1/orgs/:orgId/support-grants", async (req, reply) => {
    const org = await requireOrg(db, requireAuth(req).userId, req.params.orgId, "org.manage");
    const body = z
      .object({
        platformEmail: z.email(),
        hours: z.number().int().min(1).max(72),
        reason: z.string().trim().min(10).max(300),
      })
      .parse(req.body);
    const user = await db.user.findUnique({ where: { email: body.platformEmail.toLowerCase() } });
    const isAdmin = user ? await db.platformAdmin.findUnique({ where: { userId: user.id } }) : null;
    if (!user || !isAdmin)
      throw new HttpError(422, "not_platform_staff", "E-mail não pertence à equipe de suporte.");
    const g = await db.supportGrant.create({
      data: {
        organizationId: org.organizationId,
        platformUserId: user.id,
        grantedById: org.userId,
        reason: body.reason,
        createdAt: ctx.now(),
        expiresAt: new Date(ctx.now().getTime() + body.hours * 3600_000),
      },
    });
    await audit(db, {
      organizationId: org.organizationId,
      actorUserId: org.userId,
      action: "support.grant",
      entityType: "support_grant",
      entityId: g.id,
      data: { hours: body.hours, reason: body.reason },
    });
    return reply.status(201).send({ id: g.id, expiresAt: g.expiresAt.toISOString() });
  });

  app.post<{ Params: { orgId: string; id: string } }>(
    "/v1/orgs/:orgId/support-grants/:id/revoke",
    async (req) => {
      const org = await requireOrg(db, requireAuth(req).userId, req.params.orgId, "org.manage");
      const r = await db.supportGrant.updateMany({
        where: { id: req.params.id, organizationId: org.organizationId, revokedAt: null },
        data: { revokedAt: ctx.now() },
      });
      if (!r.count) throw notFound("Concessão");
      await audit(db, {
        organizationId: org.organizationId,
        actorUserId: org.userId,
        action: "support.revoke",
        entityType: "support_grant",
        entityId: req.params.id,
      });
      return { ok: true };
    },
  );

  // ---- Pedidos de acesso feitos pela equipe: o proprietário aprova ou recusa ----
  app.get<{ Params: { orgId: string } }>("/v1/orgs/:orgId/support-access-requests", async (req) => {
    const org = await requireOrg(db, requireAuth(req).userId, req.params.orgId, "org.manage");
    const rows = await db.supportAccessRequest.findMany({
      where: { organizationId: org.organizationId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const staff = await db.user.findMany({
      where: { id: { in: rows.map((r) => r.platformUserId) } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(staff.map((s) => [s.id, s]));
    return {
      items: rows.map((r) => ({
        id: r.id,
        staffName: byId.get(r.platformUserId)?.name ?? "Equipe Rebania",
        staffEmail: byId.get(r.platformUserId)?.email ?? null,
        reason: r.reason,
        hours: r.hours,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        decidedAt: r.decidedAt?.toISOString() ?? null,
      })),
    };
  });

  app.post<{ Params: { orgId: string; id: string } }>(
    "/v1/orgs/:orgId/support-access-requests/:id/decide",
    async (req) => {
      const org = await requireOrg(db, requireAuth(req).userId, req.params.orgId, "org.manage");
      const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
      const r = await db.supportAccessRequest.findFirst({
        where: { id: req.params.id, organizationId: org.organizationId, status: "pending" },
      });
      if (!r) throw notFound("Pedido");
      const still = await db.platformAdmin.findUnique({ where: { userId: r.platformUserId } });
      if (approve && !still)
        throw new HttpError(409, "staff_gone", "Essa pessoa não está mais na equipe.");
      const now = ctx.now();
      const result = await db.$transaction(async (tx) => {
        const claimed = await tx.supportAccessRequest.updateMany({
          where: { id: r.id, status: "pending" },
          data: {
            status: approve ? "approved" : "denied",
            decidedById: org.userId,
            decidedAt: now,
          },
        });
        if (!claimed.count) throw new HttpError(409, "already_decided", "Pedido já decidido.");
        let grantId: string | null = null;
        if (approve) {
          const g = await tx.supportGrant.create({
            data: {
              organizationId: org.organizationId,
              platformUserId: r.platformUserId,
              grantedById: org.userId,
              reason: r.reason,
              createdAt: now,
              expiresAt: new Date(now.getTime() + r.hours * 3600_000),
            },
          });
          grantId = g.id;
          await tx.supportAccessRequest.update({ where: { id: r.id }, data: { grantId } });
        }
        if (r.ticketId)
          await tx.supportMessage.create({
            data: {
              organizationId: org.organizationId,
              ticketId: r.ticketId,
              authorKind: "system",
              authorUserId: org.userId,
              body: approve
                ? `O proprietário liberou acesso de leitura por ${r.hours} h.`
                : "O proprietário recusou o pedido de acesso.",
              internal: false,
            },
          });
        await audit(tx, {
          organizationId: org.organizationId,
          actorUserId: org.userId,
          action: approve ? "support.grant" : "support.request_denied",
          entityType: approve ? "support_grant" : "support_access_request",
          entityId: grantId ?? r.id,
          data: { requestId: r.id, hours: r.hours },
        });
        return grantId;
      });
      return { ok: true, grantId: result };
    },
  );

  // ---- Chamados (todos os papéis; quem não gerencia a equipe vê só os próprios) ----
  const canSeeAll = (role: Parameters<typeof roleHas>[0]) => roleHas(role, "members.read");

  app.get<{ Params: { orgId: string } }>("/v1/orgs/:orgId/support/tickets", async (req) => {
    const org = await requireOrg(db, requireAuth(req).userId, req.params.orgId, "support.use");
    const rows = await db.supportTicket.findMany({
      where: {
        organizationId: org.organizationId,
        ...(canSeeAll(org.role) ? {} : { openedByUserId: org.userId }),
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return {
      items: rows.map((t) => ({
        id: t.id,
        number: t.number,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        channel: t.channel,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    };
  });

  app.post<{ Params: { orgId: string } }>("/v1/orgs/:orgId/support/tickets", async (req, reply) => {
    const org = await requireOrg(db, requireAuth(req).userId, req.params.orgId, "support.use");
    const body = z
      .object({
        subject: z.string().trim().min(3).max(160),
        body: z.string().trim().min(5).max(8000),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
        farmId: z.uuid().optional(),
      })
      .parse(req.body);
    if (body.farmId) {
      const f = await db.farm.findFirst({
        where: { id: body.farmId, organizationId: org.organizationId },
      });
      if (!f) throw notFound("Fazenda");
    }
    const now = ctx.now();
    const o = await db.organization.findUniqueOrThrow({ where: { id: org.organizationId } });
    const t = await db.$transaction(async (tx) => {
      const t = await tx.supportTicket.create({
        data: {
          organizationId: org.organizationId,
          subject: body.subject,
          priority: body.priority,
          channel: "app",
          farmId: body.farmId ?? null,
          openedByUserId: org.userId,
          ...slaTargets(body.priority, now),
          createdAt: now,
        },
      });
      await tx.supportMessage.create({
        data: {
          organizationId: org.organizationId,
          ticketId: t.id,
          authorUserId: org.userId,
          authorKind: "customer",
          body: body.body,
          channel: "app",
          createdAt: now,
        },
      });
      const { teamEmail } = await getMailSettings(tx);
      if (teamEmail)
        await queueEmail(tx, {
          to: teamEmail,
          template: "ticket_new_team",
          baseUrl: config.webBaseUrl,
          organizationId: org.organizationId,
          data: {
            number: t.number,
            subject: t.subject,
            organizationName: o.name,
            priority: TICKET_PRIORITY_LABEL[body.priority],
            url: `${config.webBaseUrl}/console/suporte/${t.id}`,
          },
        });
      return t;
    });
    return reply.status(201).send({ id: t.id, number: t.number });
  });

  async function customerTicket(orgId: string, userId: string, ticketId: string) {
    const org = await requireOrg(db, userId, orgId, "support.use");
    const t = await db.supportTicket.findFirst({
      where: {
        id: ticketId,
        organizationId: org.organizationId,
        ...(canSeeAll(org.role) ? {} : { openedByUserId: org.userId }),
      },
    });
    if (!t) throw notFound("Chamado");
    return { org, t };
  }

  app.get<{ Params: { orgId: string; id: string } }>(
    "/v1/orgs/:orgId/support/tickets/:id",
    async (req) => {
      const { t } = await customerTicket(req.params.orgId, requireAuth(req).userId, req.params.id);
      const messages = await db.supportMessage.findMany({
        where: { ticketId: t.id, internal: false },
        orderBy: { createdAt: "asc" },
      });
      const authors = await db.user.findMany({
        where: { id: { in: messages.map((m) => m.authorUserId).filter((x): x is string => !!x) } },
        select: { id: true, name: true },
      });
      const byId = new Map(authors.map((a) => [a.id, a.name]));
      return {
        id: t.id,
        number: t.number,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt.toISOString(),
        messages: messages.map((m) => ({
          id: m.id,
          authorKind: m.authorKind,
          // A equipe aparece como "Equipe Rebania" (sem expor nomes internos ao cliente).
          authorName:
            m.authorKind === "customer"
              ? ((m.authorUserId ? byId.get(m.authorUserId) : null) ?? "Você")
              : m.authorKind === "staff"
                ? "Equipe Rebania"
                : null,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    },
  );

  app.post<{ Params: { orgId: string; id: string } }>(
    "/v1/orgs/:orgId/support/tickets/:id/messages",
    async (req, reply) => {
      const { org, t } = await customerTicket(
        req.params.orgId,
        requireAuth(req).userId,
        req.params.id,
      );
      if (t.status === "closed")
        throw new HttpError(409, "ticket_closed", "Chamado fechado. Abra um novo chamado.");
      const { body } = z.object({ body: z.string().trim().min(1).max(8000) }).parse(req.body);
      const next = statusAfterMessage(t.status, "customer", false);
      const m = await db.$transaction(async (tx) => {
        const m = await tx.supportMessage.create({
          data: {
            organizationId: org.organizationId,
            ticketId: t.id,
            authorUserId: org.userId,
            authorKind: "customer",
            body,
            channel: "app",
          },
        });
        await tx.supportTicket.update({
          where: { id: t.id },
          data: { status: next, resolvedAt: null },
        });
        return m;
      });
      return reply.status(201).send({ id: m.id, status: next });
    },
  );

  app.post<{ Params: { orgId: string; id: string } }>(
    "/v1/orgs/:orgId/support/tickets/:id/resolve",
    async (req) => {
      const { org, t } = await customerTicket(
        req.params.orgId,
        requireAuth(req).userId,
        req.params.id,
      );
      if (t.status === "resolved" || t.status === "closed") return { ok: true };
      await db.$transaction(async (tx) => {
        await tx.supportTicket.update({
          where: { id: t.id },
          data: { status: "resolved", resolvedAt: ctx.now() },
        });
        await tx.supportMessage.create({
          data: {
            organizationId: org.organizationId,
            ticketId: t.id,
            authorKind: "system",
            authorUserId: org.userId,
            body: "O cliente marcou o chamado como resolvido.",
            internal: false,
          },
        });
      });
      return { ok: true };
    },
  );

  // ---- Comunicados ativos para quem está logado ----
  app.get("/v1/announcements", async (req) => {
    const { userId } = requireAuth(req);
    const now = ctx.now();
    const orgIds = (
      await db.membership.findMany({
        where: { userId, revokedAt: null },
        select: { organizationId: true },
      })
    ).map((m) => m.organizationId);
    const rows = await db.announcement.findMany({
      where: {
        archivedAt: null,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { startsAt: "desc" },
      take: 5,
    });
    return {
      items: rows
        .filter(
          (a) =>
            a.organizationIds.length === 0 || a.organizationIds.some((id) => orgIds.includes(id)),
        )
        .map((a) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          level: a.level,
          endsAt: a.endsAt?.toISOString() ?? null,
        })),
    };
  });
}
