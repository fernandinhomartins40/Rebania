import { describe, expect, it } from "vitest";
import { assertBunkScore, parseFeatures, penClosing, realCarcass } from "./depth.ts";

describe("módulos G8", () => {
  it("chaves desligadas por padrão", () => {
    expect(parseFeatures(undefined).confinement).toBe(false);
    expect(parseFeatures({ confinement: true, x: true })).toMatchObject({
      confinement: true,
      slaughter: false,
    });
  });
  it("escore de cocho inteiro 0–5", () => {
    expect(() => assertBunkScore(6)).toThrow();
    expect(() => assertBunkScore(2)).not.toThrow();
  });
  it("fechamento de baia sem dividir por zero", () => {
    expect(penClosing({ heads: 10, days: 0, liveGainKg: null, feedCostCents: 1000 })).toMatchObject(
      {
        costPerHeadDayCents: null,
        costPerKgGainCents: null,
      },
    );
    expect(
      penClosing({ heads: 10, days: 100, liveGainKg: 1500, feedCostCents: 300000 }),
    ).toMatchObject({
      costPerHeadDayCents: 300,
      costPerKgGainCents: 200,
    });
  });
  it("rendimento real do frigorífico", () => {
    expect(realCarcass(540, 286.2)).toEqual({ arrobas: 19.08, yieldPercent: 53 });
    expect(realCarcass(null, 300).yieldPercent).toBeNull();
  });
});
