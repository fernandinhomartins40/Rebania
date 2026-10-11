import { describe, expect, it } from "vitest";
import { DomainError } from "./errors.ts";
import { assertPlatformAccountSeparation } from "./platform.ts";

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
