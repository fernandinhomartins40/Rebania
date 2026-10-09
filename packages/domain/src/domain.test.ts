import { describe, expect, it } from "vitest";
import {
  adgFromSeries,
  ageInMonths,
  assertCategoryMatchesSex,
  assertEventDate,
  averageDailyGain,
  canAssignRole,
  candidateIdentifiers,
  daysBetween,
  DomainError,
  estimateCarcassArrobas,
  formatIdentifier,
  isCivilDate,
  latestAdg,
  normalizeIdentifier,
  pregnancyRate,
  roleHas,
  todayInTimezone,
  weightConsistencyWarning,
  assertWeightKg,
} from "./index.ts";

describe("datas civis", () => {
  it("valida datas reais", () => {
    expect(isCivilDate("2026-02-28")).toBe(true);
    expect(isCivilDate("2026-02-29")).toBe(false);
    expect(isCivilDate("2028-02-29")).toBe(true);
    expect(isCivilDate("26-1-1")).toBe(false);
  });
  it("calcula dias e idade", () => {
    expect(daysBetween("2026-01-01", "2026-03-01")).toBe(59);
    expect(daysBetween("2026-03-01", "2026-01-01")).toBe(-59);
    expect(ageInMonths("2025-01-15", "2026-01-14")).toBe(11);
    expect(ageInMonths("2025-01-15", "2026-01-15")).toBe(12);
  });
  it("usa o timezone da fazenda", () => {
    const now = new Date("2026-10-09T02:30:00Z");
    expect(todayInTimezone("America/Sao_Paulo", now)).toBe("2026-10-08");
    expect(todayInTimezone("UTC", now)).toBe("2026-10-09");
  });
});

describe("animal", () => {
  it("rejeita categoria incompatível com sexo", () => {
    expect(() => assertCategoryMatchesSex("cow", "male")).toThrow(DomainError);
    expect(() => assertCategoryMatchesSex("cow", "female")).not.toThrow();
  });
  it("rejeita evento antes do nascimento ou no futuro", () => {
    expect(() =>
      assertEventDate("2025-01-01", { birthDate: "2025-02-01", today: "2026-01-01" }),
    ).toThrow(/anterior ao nascimento/);
    expect(() => assertEventDate("2026-01-02", { today: "2026-01-01" })).toThrow(/futuro/);
    expect(() =>
      assertEventDate("2025-02-01", { birthDate: "2025-02-01", today: "2026-01-01" }),
    ).not.toThrow();
  });
});

describe("identificadores", () => {
  it("normaliza RFID ISO 11784 em 15 dígitos", () => {
    expect(normalizeIdentifier("rfid", "982 000123456789")).toBe("982000123456789");
    expect(normalizeIdentifier("rfid", "982-000123456789")).toBe("982000123456789");
    expect(() => normalizeIdentifier("rfid", "12345")).toThrow(DomainError);
    expect(formatIdentifier("rfid", "982000123456789")).toBe("982 000123456789");
  });
  it("preserva zeros à esquerda do brinco e ignora caixa/espaços", () => {
    expect(normalizeIdentifier("visual_tag", " 0512 ")).toBe("0512");
    expect(normalizeIdentifier("visual_tag", "ab 12")).toBe("AB12");
    expect(normalizeIdentifier("visual_tag", "0512")).not.toBe(
      normalizeIdentifier("visual_tag", "512"),
    );
  });
  it("normaliza UID NFC", () => {
    expect(normalizeIdentifier("nfc", "04:a2:3b:1c")).toBe("04A23B1C");
    expect(() => normalizeIdentifier("nfc", "xyz")).toThrow();
  });
  it("gera candidatos para busca sem tipo", () => {
    const c = candidateIdentifiers("0512");
    expect(c.map((x) => x.type)).toContain("visual_tag");
    expect(c.map((x) => x.type)).not.toContain("rfid");
  });
  it("rejeita vazio", () => {
    expect(() => normalizeIdentifier("visual_tag", "   ")).toThrow(/Informe/);
  });
});

describe("pesagem e GMD", () => {
  it("calcula GMD com intervalo positivo", () => {
    const r = averageDailyGain(
      { measuredOn: "2026-01-01", weightKg: 200 },
      { measuredOn: "2026-03-02", weightKg: 254 },
    );
    expect(r).toMatchObject({ ok: true, days: 60, adgKgPerDay: 0.9 });
  });
  it("não calcula GMD com data igual ou invertida (denominador zero impedido)", () => {
    expect(
      averageDailyGain(
        { measuredOn: "2026-01-01", weightKg: 200 },
        { measuredOn: "2026-01-01", weightKg: 210 },
      ),
    ).toEqual({ ok: false, reason: "non_positive_interval" });
    expect(
      averageDailyGain(
        { measuredOn: "2026-02-01", weightKg: 200 },
        { measuredOn: "2026-01-01", weightKg: 210 },
      ),
    ).toEqual({ ok: false, reason: "non_positive_interval" });
  });
  it("série ordena por data e exige 2 pontos", () => {
    expect(adgFromSeries([{ measuredOn: "2026-01-01", weightKg: 200 }])).toEqual({
      ok: false,
      reason: "insufficient_data",
    });
    const r = adgFromSeries([
      { measuredOn: "2026-03-02", weightKg: 254 },
      { measuredOn: "2026-01-01", weightKg: 200 },
    ]);
    expect(r.ok && r.adgKgPerDay).toBe(0.9);
  });
  it("GMD mais recente ignora pesagens no mesmo dia", () => {
    const r = latestAdg([
      { measuredOn: "2026-01-01", weightKg: 200 },
      { measuredOn: "2026-01-11", weightKg: 210 },
      { measuredOn: "2026-01-11", weightKg: 211 },
    ]);
    expect(r.ok).toBe(true);
  });
  it("alerta peso incoerente sem bloquear", () => {
    expect(
      weightConsistencyWarning(
        { measuredOn: "2026-01-01", weightKg: 200 },
        { measuredOn: "2026-01-02", weightKg: 260 },
      ),
    ).toMatch(/Confira o peso/);
    expect(
      weightConsistencyWarning(
        { measuredOn: "2026-01-01", weightKg: 200 },
        { measuredOn: "2026-02-01", weightKg: 220 },
      ),
    ).toBeNull();
  });
  it("valida faixa e precisão do peso", () => {
    expect(() => assertWeightKg(0)).toThrow();
    expect(() => assertWeightKg(NaN)).toThrow();
    expect(() => assertWeightKg(250.123)).toThrow();
    expect(() => assertWeightKg(250.12)).not.toThrow();
  });
  it("arroba de carcaça exige rendimento explícito e é estimativa", () => {
    const r = estimateCarcassArrobas(540, 52);
    expect(r).toEqual({
      kind: "estimate",
      carcassKg: 280.8,
      arrobas: 18.72,
      carcassYieldPercent: 52,
    });
    expect(() => estimateCarcassArrobas(540, 0)).toThrow();
  });
});

describe("reprodução", () => {
  it("ausência de diagnóstico não conta como vazia", () => {
    const r = pregnancyRate([
      { animalId: "a", lastResult: "pregnant" },
      { animalId: "b", lastResult: "open" },
      { animalId: "c", lastResult: null },
      { animalId: "d", lastResult: "inconclusive" },
    ]);
    expect(r).toMatchObject({
      exposed: 4,
      diagnosed: 3,
      notDiagnosed: 1,
      rateAmongDiagnosed: 0.5,
      coverage: 0.75,
    });
  });
  it("sem base retorna null", () => {
    expect(pregnancyRate([]).rateAmongDiagnosed).toBeNull();
  });
});

describe("permissões", () => {
  it("campo não acessa financeiro", () => {
    expect(roleHas("field", "finance.read")).toBe(false);
    expect(roleHas("owner", "finance.read")).toBe(true);
  });
  it("gerente não promove a gerente/proprietário", () => {
    expect(canAssignRole("manager", "field")).toBe(true);
    expect(canAssignRole("manager", "owner")).toBe(false);
    expect(canAssignRole("field", "field")).toBe(false);
  });
});
