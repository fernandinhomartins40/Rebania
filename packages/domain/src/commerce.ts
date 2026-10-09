import { daysBetween } from "./dates.ts";
import { DomainError } from "./errors.ts";
import { estimateCarcassArrobas, adgFromSeries, type WeightPoint } from "./weight.ts";
import type { AnimalStatus, Category } from "./animal.ts";
import { withdrawalStatus } from "./health.ts";

/**
 * Comercialização, saídas, financeiro e indicadores (MN §6, §10).
 * Dinheiro em centavos inteiros (nunca float para saldo); kg vivo ≠ arroba.
 */

// ---- Dinheiro ------------------------------------------------------------------------------

export function toCents(value: number | string): number {
  let n: number;
  if (typeof value === "number") n = value;
  else {
    const t = value.trim();
    // "1.234,56" (pt-BR) ou "1234.56"
    n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  }
  if (!Number.isFinite(n)) throw new DomainError("invalid_amount", "Valor inválido.");
  const cents = Math.round(n * 100);
  if (Math.abs(n * 100 - cents) > 1e-6) {
    throw new DomainError("invalid_amount", "Use no máximo 2 casas decimais.");
  }
  if (Math.abs(cents) > 99_999_999_999)
    throw new DomainError("invalid_amount", "Valor acima do limite.");
  return cents;
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Rateia `total` em partes proporcionais aos pesos sem perder centavos (maior resto). */
export function allocateCents(total: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  const base = sum > 0 ? weights : weights.map(() => 1);
  const s = base.reduce((a, b) => a + b, 0);
  const raw = base.map((w) => (total * w) / s);
  const floor = raw.map((r) => Math.floor(r));
  let rest = total - floor.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const o of order) {
    if (rest <= 0) break;
    floor[o.i]!++;
    rest--;
  }
  return floor;
}

// ---- Preço de compra/venda ------------------------------------------------------------------------

export const PRICE_MODES = ["per_head", "per_kg_live", "per_arroba", "total"] as const;
export type PriceMode = (typeof PRICE_MODES)[number];
export const PRICE_MODE_LABEL: Record<PriceMode, string> = {
  per_head: "Por cabeça",
  per_kg_live: "Por kg vivo",
  per_arroba: "Por arroba de carcaça (estimada)",
  total: "Valor total do lote",
};

export interface PriceInput {
  mode: PriceMode;
  /** Centavos por unidade (cabeça, kg, arroba) ou total. */
  unitCents: number;
  heads: number;
  totalLiveKg: number | null;
  /** Obrigatório para arroba: rendimento de carcaça informado, nunca presumido. */
  carcassYieldPercent?: number | null;
}

export interface PriceResult {
  totalCents: number;
  /** Explicação auditável do cálculo. */
  formula: string;
  estimatedArrobas: number | null;
}

export function computePrice(p: PriceInput): PriceResult {
  if (p.unitCents <= 0) throw new DomainError("invalid_price", "Informe um preço maior que zero.");
  if (p.heads <= 0) throw new DomainError("no_animals", "Nenhum animal na transação.");
  const brl = formatBRL(p.unitCents);
  switch (p.mode) {
    case "per_head":
      return {
        totalCents: p.unitCents * p.heads,
        formula: `${p.heads} cabeça(s) × ${brl}`,
        estimatedArrobas: null,
      };
    case "per_kg_live": {
      if (!p.totalLiveKg) throw new DomainError("weight_required", "Informe o peso vivo.");
      return {
        totalCents: Math.round(p.unitCents * p.totalLiveKg),
        formula: `${p.totalLiveKg.toLocaleString("pt-BR")} kg vivo × ${brl}/kg`,
        estimatedArrobas: null,
      };
    }
    case "per_arroba": {
      if (!p.totalLiveKg) throw new DomainError("weight_required", "Informe o peso vivo.");
      if (!p.carcassYieldPercent)
        throw new DomainError(
          "yield_required",
          "Venda por arroba exige rendimento de carcaça informado (peso vivo não é arroba).",
        );
      const est = estimateCarcassArrobas(p.totalLiveKg, p.carcassYieldPercent);
      return {
        totalCents: Math.round(p.unitCents * est.arrobas),
        formula: `${p.totalLiveKg.toLocaleString("pt-BR")} kg vivo × ${p.carcassYieldPercent}% ÷ 15 = ${est.arrobas.toLocaleString("pt-BR")} @ (estimativa) × ${brl}/@`,
        estimatedArrobas: est.arrobas,
      };
    }
    case "total":
      return { totalCents: p.unitCents, formula: `Valor total ${brl}`, estimatedArrobas: null };
  }
}

// ---- Saídas ------------------------------------------------------------------------------------------

export const EXIT_KINDS = ["sold", "dead", "culled", "transferred_out"] as const;
export type ExitKind = (typeof EXIT_KINDS)[number];

export interface SaleIssue {
  code: "not_active" | "in_withdrawal";
  message: string;
  blocking: boolean;
}

/**
 * Verificação de venda (T28/T35): animal precisa estar ativo; carência de carne
 * ativa bloqueia, salvo exceção registrada por quem tem permissão, com motivo.
 */
export function saleIssues(
  a: { status: AnimalStatus; tag: string | null; withdrawalMeatUntil: string | null },
  date: string,
): SaleIssue[] {
  const issues: SaleIssue[] = [];
  if (a.status !== "active") {
    issues.push({
      code: "not_active",
      message: `${a.tag ?? "Animal"} não está ativo (${a.status}).`,
      blocking: true,
    });
  }
  const w = withdrawalStatus(a.withdrawalMeatUntil, date);
  if (w.inWithdrawal) {
    issues.push({
      code: "in_withdrawal",
      message: `${a.tag ?? "Animal"} em carência de carne até ${w.until!.split("-").reverse().join("/")}.`,
      blocking: true,
    });
  }
  return issues;
}

// ---- Financeiro --------------------------------------------------------------------------------------

export const ENTRY_KINDS = ["income", "expense"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const EXPENSE_CATEGORIES = [
  "animal_purchase",
  "feed",
  "health",
  "reproduction",
  "labor",
  "fuel",
  "maintenance",
  "pasture",
  "freight",
  "taxes",
  "services",
  "other_expense",
] as const;
export const INCOME_CATEGORIES = ["animal_sale", "other_income"] as const;
export const ENTRY_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES] as const;
export type EntryCategory = (typeof ENTRY_CATEGORIES)[number];
export const CATEGORY_FIN_LABEL: Record<EntryCategory, string> = {
  animal_purchase: "Compra de animais",
  feed: "Alimentação / suplemento",
  health: "Sanidade",
  reproduction: "Reprodução",
  labor: "Mão de obra",
  fuel: "Combustível",
  maintenance: "Manutenção",
  pasture: "Pastagem",
  freight: "Frete",
  taxes: "Impostos e taxas",
  services: "Serviços",
  other_expense: "Outras despesas",
  animal_sale: "Venda de animais",
  other_income: "Outras receitas",
};

export function assertCategoryMatches(kind: EntryKind, category: EntryCategory) {
  const ok =
    kind === "income"
      ? (INCOME_CATEGORIES as readonly string[]).includes(category)
      : (EXPENSE_CATEGORIES as readonly string[]).includes(category);
  if (!ok) throw new DomainError("category_mismatch", "Categoria não combina com o tipo.");
}

export type EntryStatus = "open" | "paid" | "cancelled";

export function entryStatusLabel(status: EntryStatus, dueOn: string, today: string): string {
  if (status === "paid") return "Pago";
  if (status === "cancelled") return "Cancelado";
  return daysBetween(today, dueOn) < 0 ? "Vencido" : "Em aberto";
}

// ---- Indicadores (com cobertura de dados) -------------------------------------------------------------

export interface Coverage {
  /** Animais com dados suficientes / animais no denominador. */
  covered: number;
  total: number;
  percent: number;
}

export const coverage = (covered: number, total: number): Coverage => ({
  covered,
  total,
  percent: total ? Math.round((covered / total) * 1000) / 10 : 0,
});

export interface AdgReportRow {
  key: string;
  label: string;
  animals: number;
  withAdg: number;
  /** Média simples dos GMDs individuais (kg/dia); null sem base. */
  meanAdg: number | null;
  /** Animais excluídos por intervalo não positivo (mesma data/invertida). */
  invalidInterval: number;
}

/**
 * GMD por grupo no período: usa a 1ª e a última pesagem válidas DENTRO do período.
 * Animais com uma pesagem ou intervalo não positivo ficam fora do cálculo e
 * aparecem na cobertura — nunca dividem por zero.
 */
export function adgReport(
  animals: { id: string; groupKey: string; groupLabel: string; weights: WeightPoint[] }[],
  from: string,
  to: string,
): { rows: AdgReportRow[]; coverage: Coverage } {
  const groups = new Map<string, AdgReportRow & { sum: number }>();
  let covered = 0;
  for (const a of animals) {
    const g =
      groups.get(a.groupKey) ??
      ({
        key: a.groupKey,
        label: a.groupLabel,
        animals: 0,
        withAdg: 0,
        meanAdg: null,
        invalidInterval: 0,
        sum: 0,
      } as AdgReportRow & { sum: number });
    g.animals++;
    const inPeriod = a.weights.filter((w) => w.measuredOn >= from && w.measuredOn <= to);
    const r = adgFromSeries(inPeriod);
    if (r.ok) {
      g.withAdg++;
      g.sum += r.adgKgPerDay;
      covered++;
    } else if (r.reason === "non_positive_interval") g.invalidInterval++;
    groups.set(a.groupKey, g);
  }
  const rows = [...groups.values()].map(({ sum, ...g }) => ({
    ...g,
    meanAdg: g.withAdg ? Math.round((sum / g.withAdg) * 1000) / 1000 : null,
  }));
  rows.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  return { rows, coverage: coverage(covered, animals.length) };
}

export function inventoryByCategory(animals: { category: Category; status: AnimalStatus }[]) {
  const out = new Map<Category, number>();
  for (const a of animals)
    if (a.status === "active") out.set(a.category, (out.get(a.category) ?? 0) + 1);
  return out;
}

/** CSV com ; (padrão pt-BR no Excel) e aspas onde necessário. BOM para acentos. */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    const s =
      typeof v === "number"
        ? v.toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false })
        : v;
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}
