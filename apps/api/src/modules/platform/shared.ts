import {
  capacityReport,
  effectiveTerms,
  invoiceDisplayStatus,
  parseCapacityLimits,
  PLATFORM_TIMEZONE,
  todayInTimezone,
} from "@rebania/domain";
import type { Db } from "@rebania/db";
import { z } from "zod";
import type { AppContext } from "../../lib/context.ts";
import { dateToCivil } from "../../lib/dates.ts";

export const civil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const money = z.number().positive().max(99_999_999);
export const cents = (n: number) => BigInt(Math.round(n * 100));
export const num = (v: bigint | null) => (v === null ? null : Number(v));
export const today = (ctx: AppContext) => todayInTimezone(PLATFORM_TIMEZONE, ctx.now());

export const limitsSchema = z
  .object({
    farms: z.number().int().positive().max(100_000).optional(),
    activeAnimals: z.number().int().positive().max(10_000_000).optional(),
    users: z.number().int().positive().max(100_000).optional(),
    mediaGb: z.number().int().positive().max(100_000).optional(),
  })
  .strict();

export function serializeInvoice(
  i: {
    id: string;
    organizationId: string;
    contractId: string | null;
    kind: string;
    reference: string | null;
    description: string;
    amountCents: bigint;
    dueOn: Date;
    status: "pending" | "paid" | "failed" | "cancelled";
    paidAt: Date | null;
    paymentUrl: string | null;
    notes: string | null;
    createdAt: Date;
  },
  todayCivil: string,
) {
  const dueOn = dateToCivil(i.dueOn);
  return {
    id: i.id,
    organizationId: i.organizationId,
    contractId: i.contractId,
    kind: i.kind,
    reference: i.reference,
    description: i.description,
    amountCents: Number(i.amountCents),
    dueOn,
    status: i.status,
    displayStatus: invoiceDisplayStatus(i.status, dueOn, todayCivil),
    paidAt: i.paidAt?.toISOString() ?? null,
    paymentUrl: i.paymentUrl,
    notes: i.notes,
    createdAt: i.createdAt.toISOString(),
  };
}

/** Uso atual de um cliente para comparar com a capacidade contratada. */
export async function orgUsage(db: Db, organizationId: string) {
  const [farms, activeAnimals, users, media] = await Promise.all([
    db.farm.count({ where: { organizationId, archivedAt: null } }),
    db.animal.count({ where: { organizationId, status: "active" } }),
    db.membership.count({ where: { organizationId, revokedAt: null } }),
    db.attachment.aggregate({
      where: { organizationId, deletedAt: null },
      _sum: { sizeBytes: true },
    }),
  ]);
  const bytes = Number(media._sum.sizeBytes ?? 0);
  return { farms, activeAnimals, users, mediaGb: Math.round((bytes / 1024 ** 3) * 100) / 100 };
}

export function capacityFor(limits: unknown, usage: Awaited<ReturnType<typeof orgUsage>>) {
  return capacityReport(parseCapacityLimits(limits), usage);
}

/** Nomes da equipe para exibir responsáveis/autores sem expor mais nada. */
export async function staffNames(db: Db, ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!unique.length) return new Map<string, string>();
  const users = await db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}

/** Mensalidade e capacidade vigentes hoje (contrato + aditivos com vigência até hoje). */
export function contractTerms(
  c: {
    monthlyCents: bigint | null;
    limits: unknown;
    amendments?: { effectiveOn: Date; monthlyCents: bigint | null; limits: unknown }[];
  },
  todayCivil: string,
) {
  return effectiveTerms<unknown>(
    { monthlyCents: num(c.monthlyCents), limits: c.limits ?? null },
    (c.amendments ?? []).map((a) => ({
      effectiveOn: dateToCivil(a.effectiveOn),
      monthlyCents: num(a.monthlyCents),
      limits: a.limits ?? null,
    })),
    todayCivil,
  );
}
