import { describe, expect, it } from "vitest";
import {
  DEFAULT_REPRO_SETTINGS as S,
  parseReproSettings,
  projectRepro,
  categoryAfterCalving,
  categoryAfterWeaning,
} from "./repro.ts";

describe("situação reprodutiva", () => {
  it("sem histórico é desconhecida; cobertura sem diagnóstico não é vazia", () => {
    expect(projectRepro({ breedings: [], checks: [], births: [] }, S).status).toBe("unknown");
    expect(
      projectRepro({ breedings: [{ date: "2026-01-10" }], checks: [], births: [] }, S),
    ).toMatchObject({ status: "bred", expectedCalving: null });
  });
  it("prenhez com previsão pela IA, mostrando a origem", () => {
    const p = projectRepro(
      {
        breedings: [{ date: "2026-01-10" }],
        checks: [{ date: "2026-02-15", result: "pregnant" }],
        births: [],
      },
      S,
    );
    expect(p.status).toBe("pregnant");
    expect(p.expectedCalving).toMatchObject({
      date: "2026-10-27",
      windowStart: "2026-10-17",
      windowEnd: "2026-11-06",
      basis: "breeding",
    });
    expect(p.expectedCalving!.source).toMatch(/10\/01\/2026/);
  });
  it("ultrassom com idade gestacional tem prioridade", () => {
    const p = projectRepro(
      {
        breedings: [],
        checks: [{ date: "2026-03-01", result: "pregnant", estimatedGestationDays: 60 }],
        births: [],
      },
      S,
    );
    expect(p.expectedCalving).toMatchObject({ date: "2026-10-17", basis: "ultrasound" });
  });
  it("prenha sem base declarada não inventa data", () => {
    expect(
      projectRepro(
        { breedings: [], checks: [{ date: "2026-03-01", result: "pregnant" }], births: [] },
        S,
      ).expectedCalving,
    ).toBeNull();
  });
  it("monta natural em período gera janela ampla", () => {
    const p = projectRepro(
      {
        breedings: [{ date: "2026-01-01", endDate: "2026-03-01" }],
        checks: [{ date: "2026-04-15", result: "pregnant" }],
        births: [],
      },
      S,
    );
    expect(p.expectedCalving).toMatchObject({ windowStart: "2026-10-08", windowEnd: "2026-12-26" });
  });
  it("vazia após diagnóstico; nova IA volta a coberta; parto zera o ciclo", () => {
    expect(
      projectRepro(
        {
          breedings: [{ date: "2026-01-10" }],
          checks: [{ date: "2026-02-15", result: "open" }],
          births: [],
        },
        S,
      ).status,
    ).toBe("open");
    expect(
      projectRepro(
        {
          breedings: [{ date: "2026-01-10" }, { date: "2026-03-01" }],
          checks: [{ date: "2026-02-15", result: "open" }],
          births: [],
        },
        S,
      ).status,
    ).toBe("bred");
    expect(
      projectRepro(
        {
          breedings: [{ date: "2025-01-10" }],
          checks: [{ date: "2025-02-15", result: "pregnant" }],
          births: [{ date: "2025-10-20" }],
        },
        S,
      ),
    ).toMatchObject({ status: "open", since: "2025-10-20" });
  });
  it("inconclusivo mantém coberta", () => {
    expect(
      projectRepro(
        {
          breedings: [{ date: "2026-01-10" }],
          checks: [{ date: "2026-02-15", result: "inconclusive" }],
          births: [],
        },
        S,
      ).status,
    ).toBe("bred");
  });
  it("configuração fora de faixa volta ao padrão", () => {
    expect(parseReproSettings({ gestationDays: 500, weaningAgeDays: 240 })).toMatchObject({
      gestationDays: 290,
      weaningAgeDays: 240,
    });
  });
  it("promoções de categoria", () => {
    expect(categoryAfterCalving("heifer")).toBe("cow");
    expect(categoryAfterWeaning("calf_male")).toBe("steer");
    expect(categoryAfterWeaning("calf_female")).toBe("heifer");
  });
});
