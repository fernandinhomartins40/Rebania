import { addDays, daysBetween, type CivilDate } from "./dates.ts";

/**
 * Cobrança do SaaS (D-03): implantação + mensalidade + créditos. Valores são os
 * negociados no contrato (P-01); aqui ficam só as regras de calendário e acesso.
 * Datas civis no fuso da plataforma (America/Sao_Paulo).
 */
export const PLATFORM_TIMEZONE = "America/Sao_Paulo";

/** Dias de tolerância após o vencimento antes do modo somente leitura (decisão de 11/10/2026). */
export const READ_ONLY_GRACE_DAYS = 15;

/** Antecedência com que a fatura mensal é emitida antes do vencimento. */
export const MONTHLY_LEAD_DAYS = 10;

/** "2026-10-15" → "2026-10" */
export function monthlyReference(date: CivilDate): string {
  return date.slice(0, 7);
}

function shiftMonth(reference: string, months: number): string {
  const [y, m] = reference.split("-").map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + months;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** Dia de vencimento válido em qualquer mês (1–28). */
export function normalizeBillingDay(day: number | null | undefined, fallback: CivilDate): number {
  const d = day ?? Number(fallback.slice(8, 10));
  return Math.min(28, Math.max(1, Math.floor(d)));
}

export function monthlyDueDate(reference: string, billingDay: number): CivilDate {
  return `${reference}-${String(normalizeBillingDay(billingDay, `${reference}-01`)).padStart(2, "0")}`;
}

/**
 * Referências mensais que já devem ter fatura emitida hoje: vencimento dentro do
 * contrato e emissão (vencimento − antecedência) já alcançada. Recupera até 3 meses
 * para trás se o job ficou parado; quem chama ignora as que já existem.
 */
export function dueMonthlyReferences(input: {
  startsOn: CivilDate;
  endsOn: CivilDate | null;
  billingDay: number | null;
  today: CivilDate;
  leadDays?: number;
}): { reference: string; dueOn: CivilDate }[] {
  const lead = input.leadDays ?? MONTHLY_LEAD_DAYS;
  const day = normalizeBillingDay(input.billingDay, input.startsOn);
  const current = monthlyReference(input.today);
  const out: { reference: string; dueOn: CivilDate }[] = [];
  for (let offset = -3; offset <= 1; offset++) {
    const reference = shiftMonth(current, offset);
    const dueOn = monthlyDueDate(reference, day);
    if (dueOn < input.startsOn) continue;
    if (input.endsOn && dueOn > input.endsOn) continue;
    if (addDays(dueOn, -lead) > input.today) continue;
    out.push({ reference, dueOn });
  }
  return out;
}

export type InvoiceDisplayStatus = "pending" | "overdue" | "paid" | "failed" | "cancelled";

export function invoiceDisplayStatus(
  status: "pending" | "paid" | "failed" | "cancelled",
  dueOn: CivilDate,
  today: CivilDate,
): InvoiceDisplayStatus {
  if ((status === "pending" || status === "failed") && dueOn < today) return "overdue";
  return status;
}

/** Etapas da régua de cobrança; cada uma é enviada no máximo uma vez por fatura. */
export const DUNNING_STAGES = [
  "before_due",
  "due_today",
  "overdue",
  "overdue_week",
  "read_only",
] as const;
export type DunningStage = (typeof DUNNING_STAGES)[number];

/** Em que etapa da régua uma fatura em aberto está hoje (faixas toleram dias sem execução). */
export function dunningStage(dueOn: CivilDate, today: CivilDate): DunningStage | null {
  const late = daysBetween(dueOn, today);
  if (late < -3) return null;
  if (late < 0) return "before_due";
  if (late === 0) return "due_today";
  if (late < 7) return "overdue";
  if (late <= READ_ONLY_GRACE_DAYS) return "overdue_week";
  return "read_only";
}

export type AccessMode = "full" | "read_only";

/**
 * Modo de acesso do cliente. Somente leitura: vê tudo, não registra nada novo; o
 * suporte e o pagamento continuam disponíveis. Volta ao normal quando a causa sai.
 */
export function accessModeFor(input: {
  stage: "lead" | "onboarding" | "active" | "suspended" | "churned";
  contractStatus: "draft" | "active" | "suspended" | "ended" | null;
  openInvoiceDueDates: CivilDate[];
  today: CivilDate;
  graceDays?: number;
}): { mode: AccessMode; reason: string | null } {
  if (input.stage === "churned") return { mode: "read_only", reason: "Contrato encerrado." };
  if (input.stage === "suspended" || input.contractStatus === "suspended")
    return { mode: "read_only", reason: "Contrato suspenso. Fale com a equipe Rebania." };
  const grace = input.graceDays ?? READ_ONLY_GRACE_DAYS;
  const oldest = [...input.openInvoiceDueDates].sort()[0];
  if (oldest) {
    const late = daysBetween(oldest, input.today);
    if (late > grace)
      return {
        mode: "read_only",
        reason: `Fatura vencida há ${late} dias. Regularize para voltar a registrar.`,
      };
  }
  return { mode: "full", reason: null };
}

/**
 * Termos vigentes numa data: o aditivo mais recente com vigência até a data substitui
 * mensalidade e/ou capacidade do contrato (o que o aditivo não informa continua igual).
 */
export function effectiveTerms<L>(
  base: { monthlyCents: number | null; limits: L | null },
  amendments: { effectiveOn: CivilDate; monthlyCents: number | null; limits: L | null }[],
  onDate: CivilDate,
): { monthlyCents: number | null; limits: L | null } {
  const applicable = amendments
    .filter((a) => a.effectiveOn <= onDate)
    .sort((a, b) => (a.effectiveOn < b.effectiveOn ? -1 : a.effectiveOn > b.effectiveOn ? 1 : 0));
  let monthlyCents = base.monthlyCents;
  let limits = base.limits;
  for (const a of applicable) {
    if (a.monthlyCents !== null) monthlyCents = a.monthlyCents;
    if (a.limits !== null) limits = a.limits;
  }
  return { monthlyCents, limits };
}
