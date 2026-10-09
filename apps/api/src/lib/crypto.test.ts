import { describe, expect, it } from "vitest";
import { hashPassword, stableHash, verifyPassword } from "./crypto.ts";

describe("crypto", () => {
  it("hash e verificação de senha", async () => {
    const h = await hashPassword("senha-muito-segura");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("senha-muito-segura", h)).toBe(true);
    expect(await verifyPassword("outra", h)).toBe(false);
    expect(await verifyPassword("x", "lixo")).toBe(false);
  });
  it("hash estável independe da ordem das chaves", () => {
    expect(stableHash({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(
      stableHash({ b: { d: [1, 2], c: 2 }, a: 1 }),
    );
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
  });
});
