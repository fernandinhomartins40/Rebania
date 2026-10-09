import { addDays, daysBetween } from "./dates.ts";
import { DomainError } from "./errors.ts";
import type { Category } from "./animal.ts";

/**
 * Sanidade, estoque e carência (MN §6, §10). O Rebania NÃO traz protocolos,
 * doses ou carências prontos: tudo é configurado pela fazenda com a fonte
 * técnica informada (bula, responsável técnico). Sem configuração, o sistema
 * diz "não configurado" — nunca presume zero.
 */

export const PRODUCT_KINDS = [
  "vaccine",
  "antiparasitic",
  "medicine",
  "hormone",
  "semen",
  "feed",
  "supplement",
  "other",
] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];
export const PRODUCT_KIND_LABEL: Record<ProductKind, string> = {
  vaccine: "Vacina",
  antiparasitic: "Antiparasitário",
  medicine: "Medicamento",
  hormone: "Hormônio",
  semen: "Sêmen",
  feed: "Ração / alimento",
  supplement: "Suplemento / sal",
  other: "Outro",
};

export const UNITS = ["mL", "L", "dose", "g", "kg", "un"] as const;
export type Unit = (typeof UNITS)[number];
export const UNIT_LABEL: Record<Unit, string> = {
  mL: "mL",
  L: "L",
  dose: "dose(s)",
  g: "g",
  kg: "kg",
  un: "unidade(s)",
};

export const ADMIN_ROUTES = [
  "subcutaneous",
  "intramuscular",
  "intravenous",
  "oral",
  "pour_on",
  "intramammary",
  "intrauterine",
  "other",
] as const;
export type AdminRoute = (typeof ADMIN_ROUTES)[number];
export const ADMIN_ROUTE_LABEL: Record<AdminRoute, string> = {
  subcutaneous: "Subcutânea",
  intramuscular: "Intramuscular",
  intravenous: "Intravenosa",
  oral: "Oral",
  pour_on: "Pour-on (dorso)",
  intramammary: "Intramamária",
  intrauterine: "Intrauterina",
  other: "Outra",
};

export const HEALTH_KINDS = ["vaccination", "deworming", "treatment", "other"] as const;
export type HealthKind = (typeof HEALTH_KINDS)[number];
export const HEALTH_KIND_LABEL: Record<HealthKind, string> = {
  vaccination: "Vacinação",
  deworming: "Vermifugação / antiparasitário",
  treatment: "Tratamento",
  other: "Outra aplicação",
};

export const EXAM_KINDS = [
  "brucellosis",
  "tuberculosis",
  "andrological",
  "parasitological",
  "blood",
  "other",
] as const;
export type ExamKind = (typeof EXAM_KINDS)[number];
export const EXAM_KIND_LABEL: Record<ExamKind, string> = {
  brucellosis: "Brucelose",
  tuberculosis: "Tuberculose",
  andrological: "Andrológico",
  parasitological: "Parasitológico (OPG)",
  blood: "Sangue",
  other: "Outro",
};

export const TREATMENT_STATUSES = ["open", "resolved", "failed"] as const;
export type TreatmentStatus = (typeof TREATMENT_STATUSES)[number];
export const TREATMENT_STATUS_LABEL: Record<TreatmentStatus, string> = {
  open: "Em tratamento",
  resolved: "Recuperado",
  failed: "Sem resposta",
};

export const STOCK_MOVEMENT_KINDS = ["entry", "consumption", "loss", "adjustment"] as const;
export type StockMovementKind = (typeof STOCK_MOVEMENT_KINDS)[number];
export const STOCK_MOVEMENT_LABEL: Record<StockMovementKind, string> = {
  entry: "Entrada",
  consumption: "Consumo",
  loss: "Perda / descarte",
  adjustment: "Ajuste de inventário",
};

// ---- Quantidades: decimais exatos em milésimos (nunca float para saldo) -------------

const QTY_RE = /^-?\d{1,11}(?:[.,]\d{1,3})?$/;

/** Converte quantidade (número ou texto pt-BR) para milésimos inteiros. */
export function toMilli(value: number | string): number {
  const text = typeof value === "number" ? String(value) : value.trim();
  if (!QTY_RE.test(text) && !(typeof value === "number" && Number.isFinite(value))) {
    throw new DomainError("invalid_quantity", "Quantidade inválida (até 3 casas decimais).");
  }
  const n = Number(text.replace(",", "."));
  const milli = Math.round(n * 1000);
  if (Math.abs(n * 1000 - milli) > 1e-6) {
    throw new DomainError("invalid_quantity", "Use no máximo 3 casas decimais.");
  }
  return milli;
}

export function fromMilli(milli: number): number {
  return milli / 1000;
}

export function assertPositiveQuantity(value: number, label = "Quantidade"): number {
  const m = toMilli(value);
  if (m <= 0) throw new DomainError("invalid_quantity", `${label} deve ser maior que zero.`);
  if (m > 1_000_000_000) throw new DomainError("invalid_quantity", `${label} acima do limite.`);
  return m;
}

/** Sinal do movimento: entrada +, consumo/perda −, ajuste conforme informado. */
export function signedQuantity(kind: StockMovementKind, quantity: number): number {
  if (kind === "adjustment") {
    const m = toMilli(quantity);
    if (m === 0) throw new DomainError("invalid_quantity", "Ajuste não pode ser zero.");
    return fromMilli(m);
  }
  const m = assertPositiveQuantity(quantity);
  return fromMilli(kind === "entry" ? m : -m);
}

export function formatQuantity(value: number, unit: string): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${unit}`;
}

// ---- Carência ------------------------------------------------------------------------

export interface WithdrawalConfig {
  meatDays: number | null;
  milkDays: number | null;
  /** Fonte técnica (bula, responsável). Obrigatória quando há prazo configurado. */
  source: string | null;
}

export function assertWithdrawalConfig(c: WithdrawalConfig) {
  for (const d of [c.meatDays, c.milkDays]) {
    if (d !== null && (!Number.isInteger(d) || d < 0 || d > 365)) {
      throw new DomainError("invalid_withdrawal", "Carência deve ser de 0 a 365 dias.");
    }
  }
  if ((c.meatDays !== null || c.milkDays !== null) && !c.source?.trim()) {
    throw new DomainError(
      "withdrawal_source_required",
      "Informe a fonte da carência (bula ou responsável técnico).",
    );
  }
}

/** Data até a qual o animal fica em carência; null quando o produto não tem prazo configurado. */
export function withdrawalUntil(appliedOn: string, days: number | null): string | null {
  if (days === null || days === undefined) return null;
  return addDays(appliedOn, days);
}

export interface WithdrawalStatus {
  inWithdrawal: boolean;
  until: string | null;
  daysLeft: number;
}

/** Carência ativa enquanto `today` <= data final (inclusive). */
export function withdrawalStatus(until: string | null, today: string): WithdrawalStatus {
  if (!until) return { inWithdrawal: false, until: null, daysLeft: 0 };
  const left = daysBetween(today, until);
  return { inWithdrawal: left >= 0, until, daysLeft: Math.max(0, left + 1) };
}

export function maxDate(dates: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const d of dates) if (d && (!best || d > best)) best = d;
  return best;
}

// ---- Calendário sanitário ----------------------------------------------------------------

export interface PlanItemRule {
  categories: Category[];
  /** Intervalo entre aplicações; null = dose única. */
  everyDays: number | null;
  /** Idade da primeira aplicação; null = sem regra de idade (vence quando não há registro). */
  firstAtAgeDays: number | null;
}

export type DueStatus = "overdue" | "due_soon" | "scheduled" | "done" | "not_applicable";

export interface DueResult {
  status: DueStatus;
  dueOn: string | null;
  /** Explicação curta mostrada ao usuário (por que está na lista). */
  reason: string;
}

export function computeDue(
  rule: PlanItemRule,
  animal: { category: Category; birthDate: string | null },
  lastAppliedOn: string | null,
  today: string,
  soonDays = 15,
): DueResult {
  if (!rule.categories.includes(animal.category)) {
    return { status: "not_applicable", dueOn: null, reason: "Categoria fora do plano." };
  }
  let dueOn: string | null;
  let reason: string;
  if (lastAppliedOn) {
    if (rule.everyDays === null) {
      return { status: "done", dueOn: null, reason: "Dose única já aplicada." };
    }
    dueOn = addDays(lastAppliedOn, rule.everyDays);
    reason = `Última aplicação em ${lastAppliedOn.split("-").reverse().join("/")}; intervalo de ${rule.everyDays} dias.`;
  } else if (rule.firstAtAgeDays !== null) {
    if (!animal.birthDate) {
      return {
        status: "overdue",
        dueOn: today,
        reason: "Sem registro de aplicação e sem data de nascimento.",
      };
    }
    dueOn = addDays(animal.birthDate, rule.firstAtAgeDays);
    reason = `Primeira dose aos ${rule.firstAtAgeDays} dias de idade.`;
  } else {
    dueOn = today;
    reason = "Sem registro de aplicação.";
  }
  const diff = daysBetween(today, dueOn);
  const status: DueStatus = diff < 0 ? "overdue" : diff <= soonDays ? "due_soon" : "scheduled";
  return { status, dueOn, reason };
}

// ---- Sessão de manejo (Modo Curral) ---------------------------------------------------------

export const HANDLING_ITEM_STATUSES = ["pending", "done", "skipped"] as const;
export type HandlingItemStatus = (typeof HANDLING_ITEM_STATUSES)[number];

export interface SessionSummary {
  total: number;
  done: number;
  skipped: number;
  pending: number;
  addedDuringSession: number;
  exceptions: number;
}

export function summarizeSession(
  items: { status: HandlingItemStatus; added?: boolean }[],
  exceptions = 0,
): SessionSummary {
  const s: SessionSummary = {
    total: items.length,
    done: 0,
    skipped: 0,
    pending: 0,
    addedDuringSession: 0,
    exceptions,
  };
  for (const i of items) {
    s[i.status]++;
    if (i.added) s.addedDuringSession++;
  }
  return s;
}
