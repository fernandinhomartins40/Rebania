import { isValidTimezone } from "@rebania/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { audit } from "../lib/audit.ts";
import { HmacWebhookAdapter, InvalidSignatureError, type PaymentAdapter } from "../lib/billing.ts";
import type { AppContext } from "../lib/context.ts";
import { balanceOf, grant, refund, settleOrder } from "../lib/credits.ts";
import { civilToDate, dateToCivil } from "../lib/dates.ts";
import { forbidden, HttpError, notFound } from "../lib/errors.ts";
import { provisionOrganization } from "../lib/provision.ts";
import { requireOrg } from "../lib/tenant.ts";
import { requireAuth } from "../plugins/auth.ts";

const civil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.number().positive().max(99_999_999);
const cents = (n: number) => BigInt(Math.round(n * 100));

/**
 * Console da plataforma (equipe Rebania) — área separada do app do cliente.
 * Acesso só para `platform_admins` (concedido por CLI). Dados operacionais da
 * fazenda só com concessão de suporte ativa do proprietário, sempre auditada.
 */
export function platformRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config } = ctx;
  const billing: PaymentAdapter | null =
    ctx.billing !== undefined
      ? ctx.billing
      : config.billingProvider === "hmac" && config.billingWebhookSecret
        ? new HmacWebhookAdapter(config.billingWebhookSecret)
        : null;

  async function platform(req: FastifyRequest) {
    const { userId } = requireAuth(req);
    const admin = await db.platformAdmin.findUnique({ where: { userId } });
    // 404 para não revelar a existência do console a clientes.
    if (!admin) throw notFound("Recurso");
    return userId;
  }

  app.get("/v1/platform/me", async (req) => {
    const { userId } = requireAuth(req);
    return { isPlatformAdmin: Boolean(await db.platformAdmin.findUnique({ where: { userId } })) };
  });

  app.get("/v1/platform/orgs", async (req) => {
    await platform(req);
    const orgs = await db.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        farms: { where: { archivedAt: null }, select: { id: true } },
        contracts: { where: { status: "active" }, take: 1 },
        credit: true,
        _count: { select: { memberships: { where: { revokedAt: null } } } },
      },
    });
    const since = new Date(ctx.now().getTime() - 30 * 86_400_000);
    const usage = await db.aiUsage.groupBy({
      by: ["organizationId"],
      where: { createdAt: { gte: since }, status: "ok" },
      _sum: { credits: true },
      _count: { _all: true },
    });
    const animals = await db.animal.groupBy({
      by: ["organizationId"],
      where: { status: "active" },
      _count: { _all: true },
    });
    return {
      items: orgs.map((o) => ({
        id: o.id,
        name: o.name,
        createdAt: o.createdAt.toISOString(),
        farms: o.farms.length,
        members: o._count.memberships,
        activeAnimals: animals.find((a) => a.organizationId === o.id)?._count._all ?? 0,
        contract: o.contracts[0]
          ? { id: o.contracts[0].id, plan: o.contracts[0].plan, status: o.contracts[0].status }
          : null,
        credits: o.credit?.balance ?? 0,
        aiQuestions30d: usage.find((u) => u.organizationId === o.id)?._count._all ?? 0,
      })),
    };
  });

  /** T03 Implantação: organização + fazenda + convite do proprietário. */
  app.post("/v1/platform/orgs", async (req, reply) => {
    const userId = await platform(req);
    const body = z
      .object({
        orgName: z.string().trim().min(2).max(120),
        farmName: z.string().trim().min(2).max(120),
        timezone: z.string().default("America/Sao_Paulo"),
        ownerEmail: z.email(),
      })
      .parse(req.body);
    if (!isValidTimezone(body.timezone))
      throw new HttpError(422, "invalid_timezone", "Fuso inválido.");
    const r = await db.$transaction((tx) =>
      provisionOrganization(tx, {
        ...body,
        invitationTtlMs: config.invitationTtlMs,
        now: ctx.now(),
        actorUserId: userId,
      }),
    );
    return reply.status(201).send({
      organizationId: r.org.id,
      farmId: r.farm.id,
      acceptUrl: `${config.webBaseUrl}/convite#token=${r.token}`,
      expiresAt: r.inv.expiresAt.toISOString(),
    });
  });

  app.get<{ Params: { id: string } }>("/v1/platform/orgs/:id", async (req) => {
    await platform(req);
    const o = await db.organization.findUnique({
      where: { id: req.params.id },
      include: {
        farms: { select: { id: true, name: true, timezone: true, archivedAt: true } },
        contracts: { orderBy: { createdAt: "desc" } },
        invoices: { orderBy: { dueOn: "desc" }, take: 50 },
        creditOrders: { orderBy: { createdAt: "desc" }, take: 50 },
        supportGrants: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!o) throw notFound("Organização");
    const ledger = await db.creditLedger.findMany({
      where: { organizationId: o.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const now = ctx.now();
    return {
      id: o.id,
      name: o.name,
      farms: o.farms.map((f) => ({
        id: f.id,
        name: f.name,
        timezone: f.timezone,
        archived: f.archivedAt !== null,
      })),
      contracts: o.contracts.map((c) => ({
        id: c.id,
        plan: c.plan,
        status: c.status,
        implementationCents: c.implementationCents === null ? null : Number(c.implementationCents),
        monthlyCents: c.monthlyCents === null ? null : Number(c.monthlyCents),
        startsOn: dateToCivil(c.startsOn),
        endsOn: dateToCivil(c.endsOn),
        notes: c.notes,
      })),
      invoices: o.invoices.map((i) => ({
        id: i.id,
        description: i.description,
        amountCents: Number(i.amountCents),
        dueOn: dateToCivil(i.dueOn),
        status: i.status,
        paidAt: i.paidAt?.toISOString() ?? null,
      })),
      credits: {
        balance: await balanceOf(db, o.id),
        ledger: ledger.map((l) => ({
          id: l.id,
          kind: l.kind,
          amount: l.amount,
          balanceAfter: l.balanceAfter,
          reservationId: l.reservationId,
          note: l.note,
          createdAt: l.createdAt.toISOString(),
        })),
        orders: o.creditOrders.map((x) => ({
          id: x.id,
          credits: x.credits,
          priceCents: Number(x.priceCents),
          status: x.status,
          createdAt: x.createdAt.toISOString(),
        })),
      },
      supportGrants: o.supportGrants.map((g) => ({
        id: g.id,
        platformUserId: g.platformUserId,
        reason: g.reason,
        expiresAt: g.expiresAt.toISOString(),
        active: !g.revokedAt && g.expiresAt > now,
      })),
    };
  });

  // ---- Contratos e faturas (T05/T07) ----
  app.post<{ Params: { id: string } }>("/v1/platform/orgs/:id/contracts", async (req, reply) => {
    const userId = await platform(req);
    const body = z
      .object({
        plan: z.string().trim().min(2).max(120),
        implementation: money.nullable().optional(),
        monthly: money.nullable().optional(),
        startsOn: civil,
        endsOn: civil.nullable().optional(),
        status: z.enum(["draft", "active"]).default("draft"),
        notes: z.string().trim().max(1000).optional(),
      })
      .parse(req.body);
    const org = await db.organization.findUnique({ where: { id: req.params.id } });
    if (!org) throw notFound("Organização");
    const c = await db.$transaction(async (tx) => {
      if (body.status === "active")
        await tx.contract.updateMany({
          where: { organizationId: org.id, status: "active" },
          data: { status: "ended" },
        });
      const c = await tx.contract.create({
        data: {
          organizationId: org.id,
          plan: body.plan,
          status: body.status,
          implementationCents: body.implementation ? cents(body.implementation) : null,
          monthlyCents: body.monthly ? cents(body.monthly) : null,
          startsOn: civilToDate(body.startsOn),
          endsOn: body.endsOn ? civilToDate(body.endsOn) : null,
          notes: body.notes ?? null,
          createdById: userId,
        },
      });
      await audit(tx, {
        organizationId: org.id,
        actorUserId: userId,
        action: "contract.create",
        entityType: "contract",
        entityId: c.id,
        data: { plan: body.plan, status: body.status },
      });
      return c;
    });
    return reply.status(201).send({ id: c.id });
  });

  app.post<{ Params: { id: string } }>("/v1/platform/contracts/:id/status", async (req) => {
    const userId = await platform(req);
    const { status } = z
      .object({ status: z.enum(["active", "suspended", "ended"]) })
      .parse(req.body);
    const c = await db.contract.findUnique({ where: { id: req.params.id } });
    if (!c) throw notFound("Contrato");
    await db.$transaction(async (tx) => {
      if (status === "active")
        await tx.contract.updateMany({
          where: { organizationId: c.organizationId, status: "active", id: { not: c.id } },
          data: { status: "ended" },
        });
      await tx.contract.update({ where: { id: c.id }, data: { status } });
      await audit(tx, {
        organizationId: c.organizationId,
        actorUserId: userId,
        action: "contract.status",
        entityType: "contract",
        entityId: c.id,
        data: { from: c.status, to: status },
      });
    });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/v1/platform/orgs/:id/invoices", async (req, reply) => {
    const userId = await platform(req);
    const body = z
      .object({
        description: z.string().trim().min(2).max(200),
        amount: money,
        dueOn: civil,
        contractId: z.uuid().optional(),
      })
      .parse(req.body);
    const org = await db.organization.findUnique({ where: { id: req.params.id } });
    if (!org) throw notFound("Organização");
    const i = await db.invoice.create({
      data: {
        organizationId: org.id,
        contractId: body.contractId ?? null,
        description: body.description,
        amountCents: cents(body.amount),
        dueOn: civilToDate(body.dueOn),
      },
    });
    await db.auditEntry.create({
      data: {
        organizationId: org.id,
        actorUserId: userId,
        action: "invoice.create",
        entityType: "invoice",
        entityId: i.id,
        data: { amount: body.amount },
      },
    });
    return reply.status(201).send({ id: i.id });
  });

  /** Baixa manual (pagamento conciliado fora de provedor), com motivo e auditoria. */
  app.post<{ Params: { id: string } }>("/v1/platform/invoices/:id/mark", async (req) => {
    const userId = await platform(req);
    const body = z
      .object({ status: z.enum(["paid", "cancelled"]), note: z.string().trim().min(3).max(300) })
      .parse(req.body);
    const i = await db.invoice.findUnique({ where: { id: req.params.id } });
    if (!i) throw notFound("Fatura");
    const r = await db.invoice.updateMany({
      where: { id: i.id, status: { in: ["pending", "failed"] } },
      data: { status: body.status, paidAt: body.status === "paid" ? ctx.now() : null },
    });
    if (!r.count) throw new HttpError(409, "invoice_settled", "Fatura já baixada.");
    await db.auditEntry.create({
      data: {
        organizationId: i.organizationId,
        actorUserId: userId,
        action: `invoice.${body.status}`,
        entityType: "invoice",
        entityId: i.id,
        data: { note: body.note, manual: true },
      },
    });
    return { ok: true };
  });

  // ---- Créditos ----
  app.post<{ Params: { id: string } }>("/v1/platform/orgs/:id/credits", async (req) => {
    const userId = await platform(req);
    const body = z
      .object({
        amount: z
          .number()
          .int()
          .min(-1_000_000)
          .max(1_000_000)
          .refine((n) => n !== 0),
        reason: z.string().trim().min(5).max(300),
        kind: z.enum(["grant", "adjustment"]).default("grant"),
      })
      .parse(req.body);
    const org = await db.organization.findUnique({ where: { id: req.params.id } });
    if (!org) throw notFound("Organização");
    if (body.kind === "grant" && body.amount < 0)
      throw new HttpError(422, "invalid_amount", "Concessão deve ser positiva; use ajuste.");
    return {
      balance: await grant(db, {
        organizationId: org.id,
        amount: body.amount,
        actorUserId: userId,
        reason: body.reason,
        kind: body.kind,
      }),
    };
  });

  app.post<{ Params: { id: string } }>("/v1/platform/reservations/:id/refund", async (req) => {
    const userId = await platform(req);
    const { reason } = z.object({ reason: z.string().trim().min(5).max(300) }).parse(req.body);
    return { balance: await refund(db, req.params.id, userId, reason) };
  });

  app.get("/v1/platform/rate-cards", async (req) => {
    await platform(req);
    const rows = await db.rateCard.findMany({ orderBy: { version: "desc" }, take: 20 });
    return {
      items: rows.map((r) => ({
        version: r.version,
        actions: r.actions,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });

  /** Nova versão da tabela de créditos (as anteriores ficam para auditoria das reservas). */
  app.post("/v1/platform/rate-cards", async (req, reply) => {
    const userId = await platform(req);
    const { actions } = z
      .object({
        actions: z.record(z.string().regex(/^[a-z_.]{2,40}$/), z.number().int().min(1).max(10_000)),
      })
      .parse(req.body);
    const last = await db.rateCard.findFirst({ orderBy: { version: "desc" } });
    const r = await db.rateCard.create({
      data: { version: (last?.version ?? 0) + 1, actions, createdById: userId },
    });
    await db.auditEntry.create({
      data: {
        actorUserId: userId,
        action: "rate_card.create",
        entityType: "rate_card",
        entityId: String(r.version),
        data: { actions },
      },
    });
    return reply.status(201).send({ version: r.version });
  });

  app.get("/v1/platform/credit-packages", async (req) => {
    await platform(req);
    const rows = await db.creditPackage.findMany({
      where: { archivedAt: null },
      orderBy: { credits: "asc" },
    });
    return {
      items: rows.map((p) => ({
        id: p.id,
        name: p.name,
        credits: p.credits,
        priceCents: Number(p.priceCents),
      })),
    };
  });

  app.post("/v1/platform/credit-packages", async (req, reply) => {
    const userId = await platform(req);
    const body = z
      .object({
        name: z.string().trim().min(2).max(80),
        credits: z.number().int().min(1).max(1_000_000),
        price: money,
      })
      .parse(req.body);
    const p = await db.creditPackage.create({
      data: { name: body.name, credits: body.credits, priceCents: cents(body.price) },
    });
    await db.auditEntry.create({
      data: {
        actorUserId: userId,
        action: "credit_package.create",
        entityType: "credit_package",
        entityId: p.id,
        data: body,
      },
    });
    return reply.status(201).send({ id: p.id });
  });

  /** Pedido de créditos aguardando confirmação de pagamento (webhook ou baixa manual). */
  app.post<{ Params: { id: string } }>(
    "/v1/platform/orgs/:id/credit-orders",
    async (req, reply) => {
      const userId = await platform(req);
      if (!billing)
        throw new HttpError(
          503,
          "billing_not_configured",
          "Provedor de pagamento ainda não configurado.",
        );
      const { packageId } = z.object({ packageId: z.uuid() }).parse(req.body);
      const pkg = await db.creditPackage.findFirst({ where: { id: packageId, archivedAt: null } });
      if (!pkg) throw notFound("Pacote");
      const o = await db.creditOrder.create({
        data: {
          organizationId: req.params.id,
          packageId: pkg.id,
          credits: pkg.credits,
          priceCents: pkg.priceCents,
          provider: billing.id,
          createdById: userId,
        },
      });
      await db.creditOrder.update({ where: { id: o.id }, data: { providerRef: o.id } });
      return reply.status(201).send({ id: o.id, ref: o.id, status: o.status });
    },
  );

  // ---- Acesso de suporte (lado da organização: o proprietário concede) ----
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
    await db.auditEntry.create({
      data: {
        organizationId: org.organizationId,
        actorUserId: org.userId,
        action: "support.grant",
        entityType: "support_grant",
        entityId: g.id,
        data: { hours: body.hours, reason: body.reason },
      },
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
      await db.auditEntry.create({
        data: {
          organizationId: org.organizationId,
          actorUserId: org.userId,
          action: "support.revoke",
          entityType: "support_grant",
          entityId: req.params.id,
          data: {},
        },
      });
      return { ok: true };
    },
  );

  /** Leitura de suporte: só com concessão ativa; cada acesso é auditado. */
  app.get<{ Params: { orgId: string; farmId: string } }>(
    "/v1/platform/support/:orgId/farms/:farmId/summary",
    async (req) => {
      const userId = await platform(req);
      const g = await db.supportGrant.findFirst({
        where: {
          organizationId: req.params.orgId,
          platformUserId: userId,
          revokedAt: null,
          expiresAt: { gt: ctx.now() },
        },
      });
      if (!g) throw forbidden();
      const farm = await db.farm.findFirst({
        where: { id: req.params.farmId, organizationId: req.params.orgId },
      });
      if (!farm) throw notFound("Fazenda");
      await db.auditEntry.create({
        data: {
          organizationId: farm.organizationId,
          farmId: farm.id,
          actorUserId: userId,
          action: "support.read",
          entityType: "farm",
          entityId: farm.id,
          data: { grantId: g.id },
        },
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

  // ---- Plano (lado da organização, T05): contrato e faturas, sem preços inventados ----
  app.get<{ Params: { orgId: string } }>("/v1/orgs/:orgId/plan", async (req) => {
    const org = await requireOrg(db, requireAuth(req).userId, req.params.orgId, "org.manage");
    const [contract, invoices] = await Promise.all([
      db.contract.findFirst({
        where: { organizationId: org.organizationId, status: { in: ["active", "suspended"] } },
        orderBy: { createdAt: "desc" },
      }),
      db.invoice.findMany({
        where: { organizationId: org.organizationId },
        orderBy: { dueOn: "desc" },
        take: 24,
      }),
    ]);
    return {
      contract: contract
        ? {
            plan: contract.plan,
            status: contract.status,
            implementationCents:
              contract.implementationCents === null ? null : Number(contract.implementationCents),
            monthlyCents: contract.monthlyCents === null ? null : Number(contract.monthlyCents),
            startsOn: dateToCivil(contract.startsOn),
            endsOn: dateToCivil(contract.endsOn),
          }
        : null,
      invoices: invoices.map((i) => ({
        id: i.id,
        description: i.description,
        amountCents: Number(i.amountCents),
        dueOn: dateToCivil(i.dueOn),
        status: i.status,
      })),
    };
  });

  // ---- Créditos (lado da organização) ----
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

  // ---- Webhook de pagamento: assinatura verificada, idempotente por event_id ----
  void app.register(async (child) => {
    child.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
      (req as unknown as { rawBody: string }).rawBody = body as string;
      try {
        done(null, JSON.parse(body as string));
      } catch {
        done(new HttpError(400, "invalid_json", "JSON inválido."), undefined);
      }
    });
    child.post<{ Params: { provider: string } }>(
      "/v1/billing/webhooks/:provider",
      { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
      async (req, reply) => {
        if (!billing || billing.id !== req.params.provider) throw notFound("Webhook");
        const raw = (req as unknown as { rawBody: string }).rawBody ?? "";
        let ev;
        try {
          ev = billing.verify(req.headers, raw);
        } catch (err) {
          if (err instanceof InvalidSignatureError)
            return reply
              .status(401)
              .send({ error: { code: "invalid_signature", message: err.message } });
          throw err;
        }
        try {
          await db.paymentEvent.create({
            data: {
              provider: billing.id,
              eventId: ev.eventId,
              type: ev.type,
              payload: JSON.parse(raw),
            },
          });
        } catch {
          // Evento repetido: já registrado; responde 200 sem reprocessar.
          return { ok: true, duplicate: true };
        }
        const result = await db.$transaction(async (tx) => {
          let r = "ignored";
          if (ev.type === "credit_order.paid" || ev.type === "credit_order.failed") {
            const order = await tx.creditOrder.findFirst({
              where: { providerRef: ev.ref, provider: billing.id },
            });
            if (order)
              r = await settleOrder(tx, order.id, ev.type === "credit_order.paid", ctx.now());
          } else {
            const inv = await tx.invoice.findFirst({
              where: {
                OR: [
                  { providerRef: ev.ref },
                  { id: z.uuid().safeParse(ev.ref).success ? ev.ref : undefined },
                ],
              },
            });
            if (inv) {
              const u = await tx.invoice.updateMany({
                where: { id: inv.id, status: "pending" },
                data: {
                  status: ev.type === "invoice.paid" ? "paid" : "failed",
                  paidAt: ev.type === "invoice.paid" ? ctx.now() : null,
                },
              });
              r = u.count ? "updated" : "ignored";
            }
          }
          await tx.paymentEvent.update({
            where: { provider_eventId: { provider: billing.id, eventId: ev.eventId } },
            data: { processedAt: ctx.now(), result: r },
          });
          return r;
        });
        return { ok: true, result };
      },
    );
  });
}
