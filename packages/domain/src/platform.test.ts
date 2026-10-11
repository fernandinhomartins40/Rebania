import { describe, expect, it } from "vitest";
import { DomainError } from "./errors.ts";
import {
  assertKeepsAnAdmin,
  assertPlatformAccountSeparation,
  assertStageTransition,
  capacityReport,
  parseCapacityLimits,
  PLATFORM_PERMISSIONS,
  platformRoleHas,
} from "./platform.ts";

describe("conta da plataforma", () => {
  it("superadmin sem vínculos é válido", () => {
    expect(() =>
      assertPlatformAccountSeparation({ platformAdmin: true, activeMemberships: 0 }),
    ).not.toThrow();
  });

  it("cliente com vínculos é válido", () => {
    expect(() =>
      assertPlatformAccountSeparation({ platformAdmin: false, activeMemberships: 3 }),
    ).not.toThrow();
  });

  it("superadmin com qualquer vínculo de cliente é recusado", () => {
    const run = () =>
      assertPlatformAccountSeparation({ platformAdmin: true, activeMemberships: 1 });
    expect(run).toThrow(DomainError);
    expect(run).toThrow(expect.objectContaining({ code: "platform_account_separation" }));
  });
});

describe("papéis da equipe", () => {
  it("administrador tem todas as permissões", () => {
    for (const p of PLATFORM_PERMISSIONS) expect(platformRoleHas("admin", p)).toBe(true);
  });

  it("financeiro cobra, mas não gerencia equipe nem chamados", () => {
    expect(platformRoleHas("finance", "billing.manage")).toBe(true);
    expect(platformRoleHas("finance", "team.manage")).toBe(false);
    expect(platformRoleHas("finance", "support.manage")).toBe(false);
  });

  it("suporte atende e cuida de usuários, mas não mexe em cobrança", () => {
    expect(platformRoleHas("support", "support.manage")).toBe(true);
    expect(platformRoleHas("support", "customer_users.manage")).toBe(true);
    expect(platformRoleHas("support", "billing.manage")).toBe(false);
    expect(platformRoleHas("support", "settings.manage")).toBe(false);
  });

  it("implantação cadastra clientes e checklist, sem cobrança", () => {
    expect(platformRoleHas("onboarding", "customers.write")).toBe(true);
    expect(platformRoleHas("onboarding", "onboarding.manage")).toBe(true);
    expect(platformRoleHas("onboarding", "contracts.manage")).toBe(false);
  });

  it("todo papel lê clientes e escreve notas", () => {
    for (const r of ["admin", "finance", "support", "onboarding"] as const) {
      expect(platformRoleHas(r, "customers.read")).toBe(true);
      expect(platformRoleHas(r, "notes.write")).toBe(true);
    }
  });

  it("a equipe não fica sem administrador", () => {
    expect(() => assertKeepsAnAdmin(1)).not.toThrow();
    expect(() => assertKeepsAnAdmin(0)).toThrow(
      expect.objectContaining({ code: "last_platform_admin" }),
    );
  });
});

describe("ciclo de vida do cliente", () => {
  it("segue o funil e permite reativar encerrado", () => {
    expect(() => assertStageTransition("lead", "onboarding")).not.toThrow();
    expect(() => assertStageTransition("onboarding", "active")).not.toThrow();
    expect(() => assertStageTransition("active", "suspended")).not.toThrow();
    expect(() => assertStageTransition("suspended", "active")).not.toThrow();
    expect(() => assertStageTransition("churned", "active")).not.toThrow();
  });

  it("recusa saltos e repetição", () => {
    expect(() => assertStageTransition("lead", "active")).toThrow(DomainError);
    expect(() => assertStageTransition("active", "active")).toThrow(DomainError);
    expect(() => assertStageTransition("churned", "onboarding")).toThrow(DomainError);
  });
});

describe("capacidade contratada", () => {
  it("compara uso × limite sem cobrar nem bloquear", () => {
    const r = capacityReport(
      { farms: 2, activeAnimals: 1000, users: 10 },
      { farms: 1, activeAnimals: 950, users: 12, mediaGb: 3 },
    );
    const by = Object.fromEntries(r.map((l) => [l.key, l]));
    expect(by.farms!.status).toBe("ok");
    expect(by.activeAnimals!.status).toBe("near");
    expect(by.users!.status).toBe("over");
    expect(by.mediaGb!.status).toBe("unlimited");
    expect(by.mediaGb!.limit).toBeNull();
  });

  it("ignora limites inválidos", () => {
    expect(parseCapacityLimits({ farms: 3, users: -1, x: 9, activeAnimals: "10" })).toEqual({
      farms: 3,
    });
    expect(parseCapacityLimits(null)).toEqual({});
  });
});
