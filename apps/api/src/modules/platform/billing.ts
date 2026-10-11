import { addDays, PLATFORM_TIMEZONE, todayInTimezone } from "@rebania/domain";
import type { Prisma } from "@rebania/db";
import {
  billingRecipients,
  getBillingSettings,
  queueEmail,
  refreshOrgAccess,
  runBillingCycle,
} from "@rebania/saas";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../../lib/audit.ts";
import type { AppContext } from "../../lib/context.ts";
import { civilToDate, dateToCivil } from "../../lib/dates.ts";
import { HttpError, notFound } from "../../lib/errors.ts";
import { requireStaff } from "../../lib/staff.ts";
import { cents, civil, contractTerms, money, serializeInvoice, today } from "./shared.ts";

const monthKey = (d: Date) => todayInTimezone(PLATFORM_TIMEZONE, d).slice(0, 7);

export function billingRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config } = ctx;

  app.get("/v1/platform/invoices", async (req) => {
    await requireStaff(ctx, req, "customers.read");
    const q = z
      .object({
        status: z.enum(["open", "overdue", "pending", "paid", "cancelled", "failed"]).optional(),
        kind: z.enum(["implementation", "monthly", "credits", "other"]).optional(),
        orgId: z.uuid().optional(),
        from: civil.optional(),
        to: civil.optional(),
      })
      .parse(req.query);
    const t = today(ctx);
    const where: Prisma.InvoiceWhereInput = {
      organization: { isDemo: false },
      ...(q.orgId ? { organizationId: q.orgId } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.from || q.to
        ? {
            dueOn: {
              ...(q.from ? { gte: civilToDate(q.from) } : {}),
              ...(q.to ? { lte: civilToDate(q.to) } : {}),
            },
          }
        : {}),
      ...(q.status === "open"
        ? { status: { in: ["pending", "failed"] } }
        : q.status === "overdue"
          ? { status: { in: ["pending", "failed"] }, dueOn: { lt: civilToDate(t) } }
          : q.status === "pending"
            ? { status: { in: ["pending", "failed"] }, dueOn: { gte: civilToDate(t) } }
            : q.status
              ? { status: q.status }
              : {}),
    };
    const rows = await db.invoice.findMany({
      where,
      orderBy: { dueOn: "desc" },
      take: 500,
      include: { organization: { select: { name: true } } },
    });
    const items = rows.map((i) => ({
      ...serializeInvoice(i, t),
      organizationName: i.organization.name,
    }));
    return {
      items,
      totals: {
        count: items.length,
        amountCents: items.reduce((a, i) => a + i.amountCents, 0),
        overdueCents: items
          .filter((i) => i.displayStatus === "overdue")
          .reduce((a, i) => a + i.amountCents, 0),
      },
    };
  });

  app.post<{ Params: { id: string } }>(
    "/v1/platform/customers/:id/invoices",
    async (req, reply) => {
      const staff = await requireStaff(ctx, req, "billing.manage");
      const body = z
        .object({
          description: z.string().trim().min(2).max(200),
          amount: money,
          dueOn: civil,
          kind: z.enum(["implementation", "monthly", "credits", "other"]).default("other"),
          contractId: z.uuid().optional(),
          paymentUrl: z.url().max(500).nullable().optional(),
          notes: z.string().trim().max(500).nullable().optional(),
          notify: z.boolean().default(true),
        })
        .parse(req.body);
      const org = await db.organization.findUnique({ where: { id: req.params.id } });
      if (!org) throw notFound("Cliente");
      if (body.contractId) {
        const c = await db.contract.findFirst({
          where: { id: body.contractId, organizationId: org.id },
        });
        if (!c) throw notFound("Contrato");
      }
      const i = await db.$transaction(async (tx) => {
        const i = await tx.invoice.create({
          data: {
            organizationId: org.id,
            contractId: body.contractId ?? null,
            kind: body.kind,
            description: body.description,
            amountCents: cents(body.amount),
            dueOn: civilToDate(body.dueOn),
            paymentUrl: body.paymentUrl ?? null,
            notes: body.notes ?? null,
          },
        });
        await audit(tx, {
          organizationId: org.id,
          actorUserId: staff.userId,
          action: "invoice.create",
          entityType: "invoice",
          entityId: i.id,
          data: { amount: body.amount, kind: body.kind },
        });
        if (body.notify) await notifyInvoice(tx, i.id);
        return i;
      });
      return reply.status(201).send({ id: i.id });
    },
  );

  async function notifyInvoice(tx: Prisma.TransactionClient, invoiceId: string) {
    const inv = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { organization: { select: { name: true } } },
    });
    const { paymentInstructions } = await getBillingSettings(tx);
    let queued = 0;
    for (const to of await billingRecipients(tx, inv.organizationId)) {
      const id = await queueEmail(tx, {
        to,
        template: "invoice_issued",
        baseUrl: config.webBaseUrl,
        organizationId: inv.organizationId,
        data: {
          organizationName: inv.organization.name,
          description: inv.description,
          amountCents: Number(inv.amountCents),
          dueOn: dateToCivil(inv.dueOn),
          paymentUrl: inv.paymentUrl,
          instructions: paymentInstructions,
          planUrl: `${config.webBaseUrl}/fazenda/plano`,
        },
      });
      if (id) queued++;
    }
    return queued;
  }

  app.patch<{ Params: { id: string } }>("/v1/platform/invoices/:id", async (req) => {
    const staff = await requireStaff(ctx, req, "billing.manage");
    const body = z
      .object({
        paymentUrl: z.url().max(500).nullable().optional(),
        notes: z.string().trim().max(500).nullable().optional(),
        dueOn: civil.optional(),
      })
      .parse(req.body);
    const i = await db.invoice.findUnique({ where: { id: req.params.id } });
    if (!i) throw notFound("Fatura");
    if (body.dueOn && !["pending", "failed"].includes(i.status))
      throw new HttpError(409, "invoice_settled", "Fatura já baixada não muda de vencimento.");
    await db.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: i.id },
        data: {
          ...(body.paymentUrl !== undefined ? { paymentUrl: body.paymentUrl } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.dueOn ? { dueOn: civilToDate(body.dueOn) } : {}),
        },
      });
      await audit(tx, {
        organizationId: i.organizationId,
        actorUserId: staff.userId,
        action: "invoice.update",
        entityType: "invoice",
        entityId: i.id,
        data: { ...body, previousDueOn: body.dueOn ? dateToCivil(i.dueOn) : undefined },
      });
      await refreshOrgAccess(tx, i.organizationId, ctx.now(), config.webBaseUrl, staff.userId);
    });
    return { ok: true };
  });

  /** Baixa manual (pagamento conciliado fora de provedor), com motivo; o acesso é recalculado na hora. */
  app.post<{ Params: { id: string } }>("/v1/platform/invoices/:id/mark", async (req) => {
    const staff = await requireStaff(ctx, req, "billing.manage");
    const body = z
      .object({ status: z.enum(["paid", "cancelled"]), note: z.string().trim().min(3).max(300) })
      .parse(req.body);
    const i = await db.invoice.findUnique({ where: { id: req.params.id } });
    if (!i) throw notFound("Fatura");
    const mode = await db.$transaction(async (tx) => {
      const r = await tx.invoice.updateMany({
        where: { id: i.id, status: { in: ["pending", "failed"] } },
        data: { status: body.status, paidAt: body.status === "paid" ? ctx.now() : null },
      });
      if (!r.count) throw new HttpError(409, "invoice_settled", "Fatura já baixada.");
      await audit(tx, {
        organizationId: i.organizationId,
        actorUserId: staff.userId,
        action: `invoice.${body.status}`,
        entityType: "invoice",
        entityId: i.id,
        data: { note: body.note, manual: true },
      });
      return refreshOrgAccess(tx, i.organizationId, ctx.now(), config.webBaseUrl, staff.userId);
    });
    return { ok: true, accessMode: mode };
  });

  app.post<{ Params: { id: string } }>("/v1/platform/invoices/:id/resend", async (req) => {
    const staff = await requireStaff(ctx, req, "billing.manage");
    const i = await db.invoice.findUnique({ where: { id: req.params.id } });
    if (!i) throw notFound("Fatura");
    if (!["pending", "failed"].includes(i.status))
      throw new HttpError(409, "invoice_settled", "Fatura já baixada.");
    const queued = await db.$transaction(async (tx) => {
      const n = await notifyInvoice(tx, i.id);
      await audit(tx, {
        organizationId: i.organizationId,
        actorUserId: staff.userId,
        action: "invoice.resend",
        entityType: "invoice",
        entityId: i.id,
      });
      return n;
    });
    return { ok: true, recipients: queued };
  });

  /** Relatório financeiro do SaaS (sem organizações de demonstração). */
  app.get("/v1/platform/finance", async (req) => {
    await requireStaff(ctx, req, "customers.read");
    const { months } = z
      .object({ months: z.coerce.number().int().min(3).max(24).default(12) })
      .parse(req.query);
    const t = today(ctx);
    const since = civilToDate(`${addDays(t, -months * 31).slice(0, 7)}-01`);
    const [contracts, open, history] = await Promise.all([
      db.contract.findMany({
        where: { status: "active", organization: { isDemo: false } },
        include: { amendments: true, organization: { select: { name: true } } },
      }),
      db.invoice.findMany({
        where: { status: { in: ["pending", "failed"] }, organization: { isDemo: false } },
        include: { organization: { select: { id: true, name: true } } },
      }),
      db.invoice.findMany({
        where: {
          organization: { isDemo: false },
          OR: [{ dueOn: { gte: since } }, { paidAt: { gte: since } }],
          status: { not: "cancelled" },
        },
        select: { kind: true, amountCents: true, dueOn: true, paidAt: true, status: true },
      }),
    ]);
    const mrrCents = contracts.reduce((a, c) => a + (contractTerms(c, t).monthlyCents ?? 0), 0);
    const overdue = open.filter((i) => dateToCivil(i.dueOn) < t);
    const debtors = new Map<
      string,
      { id: string; name: string; overdueCents: number; oldestDueOn: string }
    >();
    for (const i of overdue) {
      const d = debtors.get(i.organizationId) ?? {
        id: i.organization.id,
        name: i.organization.name,
        overdueCents: 0,
        oldestDueOn: dateToCivil(i.dueOn),
      };
      d.overdueCents += Number(i.amountCents);
      if (dateToCivil(i.dueOn) < d.oldestDueOn) d.oldestDueOn = dateToCivil(i.dueOn);
      debtors.set(i.organizationId, d);
    }
    const series = new Map<
      string,
      { month: string; issuedCents: number; receivedCents: number; byKind: Record<string, number> }
    >();
    const bucket = (m: string) =>
      series.get(m) ??
      series.set(m, { month: m, issuedCents: 0, receivedCents: 0, byKind: {} }).get(m)!;
    for (const i of history) {
      const issued = bucket(dateToCivil(i.dueOn).slice(0, 7));
      issued.issuedCents += Number(i.amountCents);
      if (i.paidAt && i.status === "paid") {
        const rec = bucket(monthKey(i.paidAt));
        rec.receivedCents += Number(i.amountCents);
        rec.byKind[i.kind] = (rec.byKind[i.kind] ?? 0) + Number(i.amountCents);
      }
    }
    const thisMonth = t.slice(0, 7);
    const readOnly = await db.organization.count({
      where: { accessMode: "read_only", isDemo: false },
    });
    return {
      mrrCents,
      arrCents: mrrCents * 12,
      activeContracts: contracts.length,
      receivableCents: open
        .filter((i) => dateToCivil(i.dueOn) >= t)
        .reduce((a, i) => a + Number(i.amountCents), 0),
      overdueCents: overdue.reduce((a, i) => a + Number(i.amountCents), 0),
      overdueCount: overdue.length,
      receivedThisMonthCents: series.get(thisMonth)?.receivedCents ?? 0,
      readOnlyCustomers: readOnly,
      debtors: [...debtors.values()].sort((a, b) => b.overdueCents - a.overdueCents).slice(0, 20),
      series: [...series.values()]
        .filter((s) => s.month <= thisMonth)
        .sort((a, b) => (a.month < b.month ? -1 : 1))
        .slice(-months),
    };
  });

  /** Executa agora o ciclo (emissão, régua, acesso) de todos ou de um cliente. Idempotente. */
  app.post("/v1/platform/billing/run", async (req) => {
    const staff = await requireStaff(ctx, req, "billing.manage");
    const { organizationId } = z
      .object({ organizationId: z.uuid().optional() })
      .parse(req.body ?? {});
    const r = await runBillingCycle(
      db,
      ctx.now(),
      config.webBaseUrl,
      organizationId ? { organizationIds: [organizationId] } : undefined,
    );
    await audit(db, {
      organizationId: organizationId ?? null,
      actorUserId: staff.userId,
      action: "billing.cycle_manual",
      entityType: "billing",
      data: r,
    });
    return r;
  });
}
