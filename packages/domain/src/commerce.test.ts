import { describe, expect, it } from "vitest";
import { adgReport, allocateCents, computePrice, saleIssues, toCents, toCsv } from "./commerce.ts";
import { averageDailyGain, weightConsistencyWarning } from "./weight.ts";

describe("dinheiro", () => {
  it("converte para centavos sem float", () => {
    expect(toCents("1.234,56")).toBe(123456);
    expect(toCents("12.5")).toBe(1250);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(() => toCents("1,234")).toThrow(/2 casas/);
  });
  it("rateio fecha o total sem perder centavo", () => {
    const parts = allocateCents(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
    expect(allocateCents(100, [0, 0])).toEqual([50, 50]);
  });
});

describe("preço", () => {
  it("por kg vivo e por cabeça", () => {
    expect(
      computePrice({ mode: "per_kg_live", unitCents: 1050, heads: 2, totalLiveKg: 900 }).totalCents,
    ).toBe(945000);
    expect(
      computePrice({ mode: "per_head", unitCents: 300000, heads: 3, totalLiveKg: null }).totalCents,
    ).toBe(900000);
  });
  it("arroba exige rendimento informado: kg vivo não é arroba", () => {
    expect(() =>
      computePrice({ mode: "per_arroba", unitCents: 30000, heads: 1, totalLiveKg: 540 }),
    ).toThrow(/rendimento/);
    const r = computePrice({
      mode: "per_arroba",
      unitCents: 30000,
      heads: 1,
      totalLiveKg: 540,
      carcassYieldPercent: 52,
    });
    expect(r.estimatedArrobas).toBe(18.72);
    expect(r.totalCents).toBe(561600);
    expect(r.formula).toMatch(/estimativa/);
  });
});

describe("venda", () => {
  it("carência ativa bloqueia; inativo bloqueia", () => {
    expect(
      saleIssues(
        { status: "active", tag: "0284", withdrawalMeatUntil: "2026-10-20" },
        "2026-10-10",
      ),
    ).toEqual([expect.objectContaining({ code: "in_withdrawal", blocking: true })]);
    expect(
      saleIssues(
        { status: "active", tag: "0284", withdrawalMeatUntil: "2026-10-09" },
        "2026-10-10",
      ),
    ).toEqual([]);
    expect(
      saleIssues({ status: "sold", tag: "1", withdrawalMeatUntil: null }, "2026-10-10")[0]!.code,
    ).toBe("not_active");
  });
});

describe("teste obrigatório 7 — GMD", () => {
  it("mesma data ou datas invertidas não geram GMD (sem divisão por zero)", () => {
    const a = { measuredOn: "2026-10-01", weightKg: 300 };
    expect(averageDailyGain(a, { measuredOn: "2026-10-01", weightKg: 310 })).toEqual({
      ok: false,
      reason: "non_positive_interval",
    });
    expect(averageDailyGain(a, { measuredOn: "2026-09-01", weightKg: 280 }).ok).toBe(false);
  });
  it("peso incoerente gera alerta, não bloqueio", () => {
    expect(
      weightConsistencyWarning(
        { measuredOn: "2026-10-01", weightKg: 300 },
        { measuredOn: "2026-10-02", weightKg: 380 },
      ),
    ).toMatch(/Confira/);
  });
  it("relatório por grupo separa sem base e intervalo inválido na cobertura", () => {
    const r = adgReport(
      [
        {
          id: "1",
          groupKey: "g",
          groupLabel: "Lote 1",
          weights: [
            { measuredOn: "2026-01-01", weightKg: 200 },
            { measuredOn: "2026-03-02", weightKg: 260 },
          ],
        },
        {
          id: "2",
          groupKey: "g",
          groupLabel: "Lote 1",
          weights: [
            { measuredOn: "2026-02-01", weightKg: 250 },
            { measuredOn: "2026-02-01", weightKg: 255 },
          ],
        },
        {
          id: "3",
          groupKey: "g",
          groupLabel: "Lote 1",
          weights: [{ measuredOn: "2026-02-01", weightKg: 250 }],
        },
      ],
      "2026-01-01",
      "2026-12-31",
    );
    expect(r.rows[0]).toMatchObject({ animals: 3, withAdg: 1, meanAdg: 1, invalidInterval: 1 });
    expect(r.coverage).toEqual({ covered: 1, total: 3, percent: 33.3 });
  });
});

describe("CSV", () => {
  it("usa ; e escapa aspas, com BOM", () => {
    const csv = toCsv(
      ["a", "b"],
      [
        ["x;y", 1.5],
        ['"q"', null],
      ],
    );
    expect(csv.startsWith("﻿a;b\r\n")).toBe(true);
    expect(csv).toContain('"x;y";1,5');
    expect(csv).toContain('"""q""";');
  });
});
