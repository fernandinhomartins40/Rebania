import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  otpauthUri,
  totpAt,
  verifyTotp,
} from "./totp.ts";

// Vetores da RFC 6238 (SHA1, segredo ASCII "12345678901234567890"), 8 dígitos → aqui 6 finais.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("base32 ida e volta", () => {
    const b = Buffer.from("rebania-segredo");
    expect(base32Decode(base32Encode(b)).toString()).toBe("rebania-segredo");
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("vetores da RFC 6238", () => {
    expect(totpAt(RFC_SECRET, Math.floor(59 / 30), 8)).toBe("94287082");
    expect(totpAt(RFC_SECRET, Math.floor(1111111109 / 30), 8)).toBe("07081804");
    expect(totpAt(RFC_SECRET, Math.floor(1234567890 / 30), 8)).toBe("89005924");
  });

  it("aceita um passo de diferença e recusa o resto", () => {
    const now = new Date(1_700_000_000_000);
    const counter = Math.floor(now.getTime() / 30_000);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, counter), now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, counter - 1), now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, counter + 3), now)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "abc123", now)).toBe(false);
  });

  it("URI para o aplicativo autenticador", () => {
    expect(otpauthUri("ABC", "ana@rebania.com.br")).toBe(
      "otpauth://totp/Rebania%3Aana%40rebania.com.br?secret=ABC&issuer=Rebania&algorithm=SHA1&digits=6&period=30",
    );
  });
});
