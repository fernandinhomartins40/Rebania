import { describe, expect, it } from "vitest";
import {
  assertWithdrawalConfig,
  computeDue,
  maxDate,
  signedQuantity,
  summarizeSession,
  toMilli,
  withdrawalStatus,
  withdrawalUntil,
} from "./health.ts";

describe("quantidades", () => {
  it("converte em milésimos exatos sem erro de float", () => {
    expect(toMilli(0.1 + 0.2)).toBe(300);
    expect(toMilli("2,5")).toBe(2500);
    expect(() => toMilli("1,2345")).toThrow(/3 casas/);
    expect(() => toMilli("abc")).toThrow();
  });
  it("aplica sinal por tipo de movimento", () => {
    expect(signedQuantity("entry", 10)).toBe(10);
    expect(signedQuantity("consumption", 2.5)).toBe(-2.5);
    expect(signedQuantity("loss", 1)).toBe(-1);
    expect(signedQuantity("adjustment", -3)).toBe(-3);
    expect(() => signedQuantity("consumption", 0)).toThrow();
    expect(() => signedQuantity("adjustment", 0)).toThrow();
  });
});

describe("carência", () => {
  it("não presume prazo quando não configurado", () => {
    expect(withdrawalUntil("2026-10-01", null)).toBeNull();
    expect(withdrawalStatus(null, "2026-10-01").inWithdrawal).toBe(false);
  });
  it("conta o último dia como carência", () => {
    const until = withdrawalUntil("2026-10-01", 30)!;
    expect(until).toBe("2026-10-31");
    expect(withdrawalStatus(until, "2026-10-31")).toMatchObject({
      inWithdrawal: true,
      daysLeft: 1,
    });
    expect(withdrawalStatus(until, "2026-11-01").inWithdrawal).toBe(false);
  });
  it("exige fonte técnica para prazo configurado", () => {
    expect(() => assertWithdrawalConfig({ meatDays: 30, milkDays: null, source: "" })).toThrow(
      /fonte/,
    );
    expect(() =>
      assertWithdrawalConfig({ meatDays: null, milkDays: null, source: null }),
    ).not.toThrow();
  });
  it("maxDate ignora vazios", () => {
    expect(maxDate([null, "2026-01-02", undefined, "2026-03-01"])).toBe("2026-03-01");
  });
});

describe("calendário sanitário", () => {
  const rule = { categories: ["heifer", "cow"] as const, everyDays: 180, firstAtAgeDays: null };
  it("ignora categoria fora do plano", () => {
    expect(
      computeDue(
        { ...rule, categories: ["cow"] },
        { category: "bull", birthDate: null },
        null,
        "2026-10-01",
      ).status,
    ).toBe("not_applicable");
  });
  it("calcula próxima dose pelo intervalo", () => {
    const r = computeDue(
      { ...rule, categories: ["cow"] },
      { category: "cow", birthDate: null },
      "2026-05-01",
      "2026-10-20",
    );
    expect(r).toMatchObject({ status: "due_soon", dueOn: "2026-10-28" });
    const late = computeDue(
      { ...rule, categories: ["cow"] },
      { category: "cow", birthDate: null },
      "2026-01-01",
      "2026-10-01",
    );
    expect(late.status).toBe("overdue");
  });
  it("dose única aplicada não volta a vencer", () => {
    expect(
      computeDue(
        { categories: ["calf_female"], everyDays: null, firstAtAgeDays: 90 },
        { category: "calf_female", birthDate: "2026-06-01" },
        "2026-09-01",
        "2026-10-01",
      ).status,
    ).toBe("done");
  });
  it("primeira dose pela idade", () => {
    const r = computeDue(
      { categories: ["calf_female"], everyDays: null, firstAtAgeDays: 120 },
      { category: "calf_female", birthDate: "2026-07-01" },
      null,
      "2026-10-01",
    );
    expect(r).toMatchObject({ status: "scheduled", dueOn: "2026-10-29" });
  });
});

describe("sessão de manejo", () => {
  it("resume realizados, pulados e pendentes", () => {
    const items = [
      ...Array.from({ length: 32 }, () => ({ status: "done" as const })),
      { status: "skipped" as const },
      { status: "pending" as const },
      { status: "pending" as const, added: true },
    ];
    expect(summarizeSession(items, 1)).toEqual({
      total: 35,
      done: 32,
      skipped: 1,
      pending: 2,
      addedDuringSession: 1,
      exceptions: 1,
    });
  });
});
