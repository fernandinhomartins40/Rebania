import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../../lib/audit.ts";
import { resolveBilling } from "../../lib/billing.ts";
import type { AppContext } from "../../lib/context.ts";
import { grant, refund } from "../../lib/credits.ts";
import { HttpError, notFound } from "../../lib/errors.ts";
import { requireStaff } from "../../lib/staff.ts";
import { cents, money } from "./shared.ts";

/** Créditos de IA no console: concessão/ajuste, estorno, tabela por ação e pacotes. */
export function creditRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const billing = resolveBilling(ctx);

  app.post<{ Params: { id: string } }>("/v1/platform/customers/:id/credits", async (req) => {
    const staff = await requireStaff(ctx, req, "credits.manage");
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
    if (!org) throw notFound("Cliente");
    if (body.kind === "grant" && body.amount < 0)
      throw new HttpError(422, "invalid_amount", "Concessão deve ser positiva; use ajuste.");
    return {
      balance: await grant(db, {
        organizationId: org.id,
        amount: body.amount,
        actorUserId: staff.userId,
        reason: body.reason,
        kind: body.kind,
      }),
    };
  });

  app.post<{ Params: { id: string } }>("/v1/platform/reservations/:id/refund", async (req) => {
    const staff = await requireStaff(ctx, req, "credits.manage");
    const { reason } = z.object({ reason: z.string().trim().min(5).max(300) }).parse(req.body);
    return { balance: await refund(db, req.params.id, staff.userId, reason) };
  });

  app.get("/v1/platform/rate-cards", async (req) => {
    await requireStaff(ctx, req, "customers.read");
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
    const staff = await requireStaff(ctx, req, "credits.manage");
    const { actions } = z
      .object({
        actions: z.record(z.string().regex(/^[a-z_.]{2,40}$/), z.number().int().min(1).max(10_000)),
      })
      .parse(req.body);
    const last = await db.rateCard.findFirst({ orderBy: { version: "desc" } });
    const r = await db.rateCard.create({
      data: { version: (last?.version ?? 0) + 1, actions, createdById: staff.userId },
    });
    await audit(db, {
      actorUserId: staff.userId,
      action: "rate_card.create",
      entityType: "rate_card",
      entityId: String(r.version),
      data: { actions },
    });
    return reply.status(201).send({ version: r.version });
  });

  app.get("/v1/platform/credit-packages", async (req) => {
    await requireStaff(ctx, req, "customers.read");
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
    const staff = await requireStaff(ctx, req, "credits.manage");
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
    await audit(db, {
      actorUserId: staff.userId,
      action: "credit_package.create",
      entityType: "credit_package",
      entityId: p.id,
      data: body,
    });
    return reply.status(201).send({ id: p.id });
  });

  app.post<{ Params: { id: string } }>("/v1/platform/credit-packages/:id/archive", async (req) => {
    const staff = await requireStaff(ctx, req, "credits.manage");
    const r = await db.creditPackage.updateMany({
      where: { id: req.params.id, archivedAt: null },
      data: { archivedAt: ctx.now() },
    });
    if (!r.count) throw notFound("Pacote");
    await audit(db, {
      actorUserId: staff.userId,
      action: "credit_package.archive",
      entityType: "credit_package",
      entityId: req.params.id,
    });
    return { ok: true };
  });

  /** Pedido de créditos aguardando confirmação de pagamento (webhook ou baixa manual). */
  app.post<{ Params: { id: string } }>(
    "/v1/platform/customers/:id/credit-orders",
    async (req, reply) => {
      const staff = await requireStaff(ctx, req, "credits.manage");
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
          createdById: staff.userId,
        },
      });
      await db.creditOrder.update({ where: { id: o.id }, data: { providerRef: o.id } });
      return reply.status(201).send({ id: o.id, ref: o.id, status: o.status });
    },
  );
}
