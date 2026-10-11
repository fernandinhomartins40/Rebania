import type { Db, Prisma, Tx } from "@rebania/db";
import {
  accessModeFor,
  addDays,
  dueMonthlyReferences,
  dunningStage,
  effectiveTerms,
  PLATFORM_TIMEZONE,
  READ_ONLY_GRACE_DAYS,
  todayInTimezone,
  type CivilDate,
} from "@rebania/domain";
import { queueEmail } from "./mail/queue.ts";
import { getBillingSettings } from "./settings.ts";

type Client = Db | Tx;

export const civilToDate = (civil: string) => new Date(`${civil}T00:00:00.000Z`);
export const dateToCivil = (d: Date) => d.toISOString().slice(0, 10);
export const platformToday = (now: Date) => todayInTimezone(PLATFORM_TIMEZONE, now);

const monthLabel = (reference: string) => `${reference.slice(5, 7)}/${reference.slice(0, 4)}`;

/** Quem recebe e-mails de cobrança: contatos financeiros; sem eles, os proprietários. */
export async function billingRecipients(db: Client, organizationId: string): Promise<string[]> {
  const contacts = await db.orgContact.findMany({
    where: { organizationId, billing: true, archivedAt: null, email: { not: null } },
    select: { email: true },
  });
  const emails = contacts.map((c) => c.email!).filter(Boolean);
  if (emails.length) return [...new Set(emails)];
  const owners = await db.membership.findMany({
    where: { organizationId, role: "owner", revokedAt: null, user: { disabledAt: null } },
    select: { user: { select: { email: true } } },
  });
  return [...new Set(owners.map((o) => o.user.email))];
}

async function audit(
  db: Client,
  data: {
    organizationId: string;
    action: string;
    entityType: string;
    entityId: string;
    payload: Prisma.InputJsonValue;
  },
) {
  await db.auditEntry.create({
    data: {
      organizationId: data.organizationId,
      actorUserId: null,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      data: data.payload,
    },
  });
}

async function notifyInvoice(
  db: Client,
  invoice: {
    id: string;
    organizationId: string;
    description: string;
    amountCents: bigint;
    dueOn: Date;
    paymentUrl: string | null;
  },
  baseUrl: string,
) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: invoice.organizationId } });
  const { paymentInstructions } = await getBillingSettings(db);
  for (const to of await billingRecipients(db, invoice.organizationId)) {
    await queueEmail(db, {
      to,
      template: "invoice_issued",
      baseUrl,
      organizationId: invoice.organizationId,
      data: {
        organizationName: org.name,
        description: invoice.description,
        amountCents: Number(invoice.amountCents),
        dueOn: dateToCivil(invoice.dueOn),
        paymentUrl: invoice.paymentUrl,
        instructions: paymentInstructions,
        planUrl: `${baseUrl}/fazenda/plano`,
      },
    });
  }
}

/** Fatura de implantação (uma por contrato), emitida quando o contrato é ativado. */
export async function ensureImplementationInvoice(
  db: Client,
  contractId: string,
  now: Date,
  baseUrl: string,
): Promise<string | null> {
  const c = await db.contract.findUnique({ where: { id: contractId } });
  if (!c || c.status !== "active" || !c.implementationCents) return null;
  const existing = await db.invoice.findFirst({
    where: { contractId: c.id, kind: "implementation", reference: "implantacao" },
  });
  if (existing) return null;
  const today = platformToday(now);
  const start = dateToCivil(c.startsOn);
  const inv = await db.invoice.create({
    data: {
      organizationId: c.organizationId,
      contractId: c.id,
      kind: "implementation",
      reference: "implantacao",
      description: `Implantação · ${c.plan}`,
      amountCents: c.implementationCents,
      dueOn: civilToDate(start > today ? start : addDays(today, 7)),
    },
  });
  await audit(db, {
    organizationId: c.organizationId,
    action: "invoice.issued",
    entityType: "invoice",
    entityId: inv.id,
    payload: { kind: "implementation", automatic: true },
  });
  await notifyInvoice(db, inv, baseUrl);
  return inv.id;
}

/** Emite as mensalidades devidas de todos os contratos ativos (idempotente por competência). */
/** Restringe o ciclo a alguns clientes (console: "executar para este cliente"; testes). */
export interface BillingScope {
  organizationIds?: string[];
}
const scoped = (scope?: BillingScope) =>
  scope?.organizationIds ? { organizationId: { in: scope.organizationIds } } : {};

export async function generateMonthlyInvoices(
  db: Db,
  now: Date,
  baseUrl: string,
  scope?: BillingScope,
): Promise<number> {
  const today = platformToday(now);
  const contracts = await db.contract.findMany({
    where: { status: "active", organization: { isDemo: false }, ...scoped(scope) },
    include: { amendments: true },
  });
  let created = 0;
  for (const c of contracts) {
    const refs = dueMonthlyReferences({
      startsOn: dateToCivil(c.startsOn),
      endsOn: c.endsOn ? dateToCivil(c.endsOn) : null,
      billingDay: c.billingDay,
      today,
    });
    for (const { reference, dueOn } of refs) {
      const terms = effectiveTerms(
        { monthlyCents: c.monthlyCents === null ? null : Number(c.monthlyCents), limits: null },
        c.amendments.map((a) => ({
          effectiveOn: dateToCivil(a.effectiveOn),
          monthlyCents: a.monthlyCents === null ? null : Number(a.monthlyCents),
          limits: null,
        })),
        dueOn,
      );
      if (!terms.monthlyCents) continue;
      const exists = await db.invoice.findFirst({
        where: { contractId: c.id, kind: "monthly", reference },
        select: { id: true },
      });
      if (exists) continue;
      try {
        await db.$transaction(async (tx) => {
          const inv = await tx.invoice.create({
            data: {
              organizationId: c.organizationId,
              contractId: c.id,
              kind: "monthly",
              reference,
              description: `Mensalidade ${monthLabel(reference)} · ${c.plan}`,
              amountCents: BigInt(terms.monthlyCents!),
              dueOn: civilToDate(dueOn),
            },
          });
          await audit(tx, {
            organizationId: c.organizationId,
            action: "invoice.issued",
            entityType: "invoice",
            entityId: inv.id,
            payload: { kind: "monthly", reference, automatic: true },
          });
          await notifyInvoice(tx, inv, baseUrl);
        });
        created++;
      } catch (err) {
        // Outra execução emitiu a mesma competência ao mesmo tempo: a unicidade segura.
        if (!(err instanceof Error && /Unique constraint|P2002/.test(err.message))) throw err;
      }
    }
  }
  return created;
}

/** Régua de cobrança: cada etapa vai uma vez por fatura (InvoiceReminder único). */
export async function runDunning(
  db: Db,
  now: Date,
  baseUrl: string,
  scope?: BillingScope,
): Promise<number> {
  const today = platformToday(now);
  const open = await db.invoice.findMany({
    where: {
      status: { in: ["pending", "failed"] },
      dueOn: { gte: civilToDate(addDays(today, -60)), lte: civilToDate(addDays(today, 3)) },
      organization: { isDemo: false },
      ...scoped(scope),
    },
  });
  const { paymentInstructions } = await getBillingSettings(db);
  let sent = 0;
  for (const inv of open) {
    const stage = dunningStage(dateToCivil(inv.dueOn), today);
    if (!stage || stage === "read_only") continue; // somente leitura avisa pelo e-mail de acesso
    const done = await db.invoiceReminder.findUnique({
      where: { invoiceId_stage: { invoiceId: inv.id, stage } },
    });
    if (done) continue;
    try {
      await db.$transaction(async (tx) => {
        const reminder = await tx.invoiceReminder.create({
          data: { organizationId: inv.organizationId, invoiceId: inv.id, stage },
        });
        let emailId: string | null = null;
        for (const to of await billingRecipients(tx, inv.organizationId)) {
          emailId =
            (await queueEmail(tx, {
              to,
              template: "invoice_reminder",
              baseUrl,
              organizationId: inv.organizationId,
              data: {
                stage,
                description: inv.description,
                amountCents: Number(inv.amountCents),
                dueOn: dateToCivil(inv.dueOn),
                paymentUrl: inv.paymentUrl,
                instructions: paymentInstructions,
                planUrl: `${baseUrl}/fazenda/plano`,
                graceDays: READ_ONLY_GRACE_DAYS,
              },
            })) ?? emailId;
        }
        if (emailId)
          await tx.invoiceReminder.update({ where: { id: reminder.id }, data: { emailId } });
      });
      sent++;
    } catch (err) {
      if (!(err instanceof Error && /Unique constraint|P2002/.test(err.message))) throw err;
    }
  }
  return sent;
}

/**
 * Recalcula o modo de acesso do cliente (completo × somente leitura) e avisa por e-mail
 * quando muda. Chamado pelo ciclo diário e logo após baixa de fatura ou mudança de contrato.
 */
export async function refreshOrgAccess(
  db: Client,
  organizationId: string,
  now: Date,
  baseUrl: string,
  actorUserId: string | null = null,
): Promise<"full" | "read_only"> {
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org) return "full";
  if (org.isDemo) return org.accessMode;
  const [contract, open] = await Promise.all([
    db.contract.findFirst({
      where: { organizationId, status: { in: ["active", "suspended"] } },
      orderBy: { createdAt: "desc" },
      select: { status: true },
    }),
    db.invoice.findMany({
      where: { organizationId, status: { in: ["pending", "failed"] } },
      select: { dueOn: true },
    }),
  ]);
  const next = accessModeFor({
    stage: org.stage,
    contractStatus: contract?.status ?? null,
    openInvoiceDueDates: open.map((i) => dateToCivil(i.dueOn)) as CivilDate[],
    today: platformToday(now),
  });
  if (next.mode === org.accessMode && next.reason === org.accessReason) return org.accessMode;
  await db.organization.update({
    where: { id: organizationId },
    data: { accessMode: next.mode, accessReason: next.reason, accessChangedAt: now },
  });
  if (next.mode !== org.accessMode) {
    await db.auditEntry.create({
      data: {
        organizationId,
        actorUserId,
        action: next.mode === "read_only" ? "org.read_only" : "org.access_restored",
        entityType: "organization",
        entityId: organizationId,
        data: { reason: next.reason },
      },
    });
    for (const to of await billingRecipients(db, organizationId)) {
      if (next.mode === "read_only")
        await queueEmail(db, {
          to,
          template: "access_read_only",
          baseUrl,
          organizationId,
          data: {
            organizationName: org.name,
            reason: next.reason ?? "",
            planUrl: `${baseUrl}/fazenda/plano`,
          },
        });
      else
        await queueEmail(db, {
          to,
          template: "access_restored",
          baseUrl,
          organizationId,
          data: { organizationName: org.name },
        });
    }
  }
  return next.mode;
}

/** Ciclo diário: emitir mensalidades, régua de cobrança e acesso de todos os clientes. */
export async function runBillingCycle(db: Db, now: Date, baseUrl: string, scope?: BillingScope) {
  const issued = await generateMonthlyInvoices(db, now, baseUrl, scope);
  const reminders = await runDunning(db, now, baseUrl, scope);
  const orgs = await db.organization.findMany({
    where: {
      isDemo: false,
      ...(scope?.organizationIds ? { id: { in: scope.organizationIds } } : {}),
    },
    select: { id: true },
  });
  let readOnly = 0;
  for (const o of orgs) {
    if ((await refreshOrgAccess(db, o.id, now, baseUrl)) === "read_only") readOnly++;
  }
  return { issued, reminders, readOnly };
}
