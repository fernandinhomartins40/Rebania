import { describe, expect, it } from "vitest";
import {
  accessModeFor,
  effectiveTerms,
  dueMonthlyReferences,
  dunningStage,
  invoiceDisplayStatus,
  monthlyDueDate,
  normalizeBillingDay,
} from "./saas-billing.ts";
import { slaState, slaTargets, statusAfterMessage } from "./support.ts";

describe("mensalidade", () => {
  it("dia de vencimento fica entre 1 e 28", () => {
    expect(normalizeBillingDay(31, "2026-01-01")).toBe(28);
    expect(normalizeBillingDay(null, "2026-01-30")).toBe(28);
    expect(normalizeBillingDay(0, "2026-01-30")).toBe(1);
    expect(monthlyDueDate("2026-02", 10)).toBe("2026-02-10");
  });

  it("emite com antecedência e só dentro do contrato", () => {
    const base = { startsOn: "2026-09-01", endsOn: null, billingDay: 10 };
    // 30/09: outubro vence 10/10, emissão a partir de 30/09
    expect(dueMonthlyReferences({ ...base, today: "2026-09-30" }).map((r) => r.reference)).toEqual([
      "2026-09",
      "2026-10",
    ]);
    // 29/09: outubro ainda não
    expect(dueMonthlyReferences({ ...base, today: "2026-09-29" }).map((r) => r.reference)).toEqual([
      "2026-09",
    ]);
    // contrato começa 15/09: setembro (10/09) fica de fora
    expect(
      dueMonthlyReferences({ ...base, startsOn: "2026-09-15", today: "2026-09-30" }).map(
        (r) => r.reference,
      ),
    ).toEqual(["2026-10"]);
    // contrato encerrado em 31/10: novembro não sai
    expect(
      dueMonthlyReferences({ ...base, endsOn: "2026-10-31", today: "2026-10-31" }).map(
        (r) => r.reference,
      ),
    ).toEqual(["2026-09", "2026-10"]);
  });

  it("vira o ano", () => {
    expect(
      dueMonthlyReferences({
        startsOn: "2026-01-05",
        endsOn: null,
        billingDay: 5,
        today: "2026-12-27",
      }).map((r) => r.reference),
    ).toEqual(["2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
  });
});

describe("régua de cobrança e acesso", () => {
  it("etapas da régua", () => {
    expect(dunningStage("2026-10-20", "2026-10-16")).toBeNull();
    expect(dunningStage("2026-10-20", "2026-10-17")).toBe("before_due");
    expect(dunningStage("2026-10-20", "2026-10-20")).toBe("due_today");
    expect(dunningStage("2026-10-20", "2026-10-21")).toBe("overdue");
    expect(dunningStage("2026-10-20", "2026-10-27")).toBe("overdue_week");
    expect(dunningStage("2026-10-20", "2026-11-04")).toBe("overdue_week");
    expect(dunningStage("2026-10-20", "2026-11-05")).toBe("read_only");
  });

  it("vencida aparece como em atraso", () => {
    expect(invoiceDisplayStatus("pending", "2026-10-10", "2026-10-11")).toBe("overdue");
    expect(invoiceDisplayStatus("pending", "2026-10-11", "2026-10-11")).toBe("pending");
    expect(invoiceDisplayStatus("paid", "2026-10-01", "2026-10-11")).toBe("paid");
  });

  it("somente leitura só depois de 15 dias de atraso", () => {
    const base = { stage: "active" as const, contractStatus: "active" as const };
    expect(
      accessModeFor({ ...base, openInvoiceDueDates: ["2026-10-01"], today: "2026-10-16" }).mode,
    ).toBe("full");
    const ro = accessModeFor({
      ...base,
      openInvoiceDueDates: ["2026-10-05", "2026-10-01"],
      today: "2026-10-17",
    });
    expect(ro.mode).toBe("read_only");
    expect(ro.reason).toContain("16 dias");
  });

  it("suspensão e encerramento deixam em somente leitura", () => {
    const base = { openInvoiceDueDates: [], today: "2026-10-11" };
    expect(accessModeFor({ ...base, stage: "suspended", contractStatus: "active" }).mode).toBe(
      "read_only",
    );
    expect(accessModeFor({ ...base, stage: "active", contractStatus: "suspended" }).mode).toBe(
      "read_only",
    );
    expect(accessModeFor({ ...base, stage: "churned", contractStatus: null }).mode).toBe(
      "read_only",
    );
    expect(accessModeFor({ ...base, stage: "onboarding", contractStatus: null }).mode).toBe("full");
  });
});

describe("chamados", () => {
  it("prazos por prioridade", () => {
    const t0 = new Date("2026-10-11T12:00:00Z");
    const s = slaTargets("urgent", t0);
    expect(s.firstResponseDueAt.toISOString()).toBe("2026-10-11T14:00:00.000Z");
    expect(s.resolutionDueAt.toISOString()).toBe("2026-10-12T12:00:00.000Z");
  });

  it("estado do prazo", () => {
    const open = new Date("2026-10-11T00:00:00Z");
    const due = new Date("2026-10-11T04:00:00Z");
    expect(slaState(open, due, null, new Date("2026-10-11T01:00:00Z"))).toBe("ok");
    expect(slaState(open, due, null, new Date("2026-10-11T03:30:00Z"))).toBe("at_risk");
    expect(slaState(open, due, null, new Date("2026-10-11T05:00:00Z"))).toBe("breached");
    expect(slaState(open, due, new Date("2026-10-11T02:00:00Z"), new Date())).toBe("met");
  });

  it("transições por mensagem", () => {
    expect(statusAfterMessage("waiting_customer", "customer", false)).toBe("open");
    expect(statusAfterMessage("resolved", "customer", false)).toBe("open");
    expect(statusAfterMessage("open", "staff", false)).toBe("waiting_customer");
    expect(statusAfterMessage("open", "staff", true)).toBe("open");
  });
});

describe("aditivos", () => {
  it("vale o aditivo mais recente até a data, campo a campo", () => {
    const base = { monthlyCents: 10000, limits: { farms: 1 } };
    const amendments = [
      { effectiveOn: "2026-11-01", monthlyCents: 15000, limits: null },
      { effectiveOn: "2026-12-01", monthlyCents: null, limits: { farms: 3 } },
    ];
    expect(effectiveTerms(base, amendments, "2026-10-31")).toEqual(base);
    expect(effectiveTerms(base, amendments, "2026-11-10")).toEqual({
      monthlyCents: 15000,
      limits: { farms: 1 },
    });
    expect(effectiveTerms(base, amendments, "2026-12-10")).toEqual({
      monthlyCents: 15000,
      limits: { farms: 3 },
    });
  });
});
