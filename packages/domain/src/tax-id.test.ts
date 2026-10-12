import { describe, expect, it } from "vitest";
import { formatTaxId, maskTaxId, taxIdKind } from "./tax-id.ts";

describe("CPF/CNPJ", () => {
  it("reconhece CPF e CNPJ válidos com ou sem pontuação", () => {
    expect(taxIdKind("529.982.247-25")).toBe("cpf");
    expect(taxIdKind("52998224725")).toBe("cpf");
    expect(taxIdKind("11.222.333/0001-81")).toBe("cnpj");
    expect(taxIdKind("11222333000181")).toBe("cnpj");
  });

  it("recusa dígito verificador errado, sequência repetida e tamanho errado", () => {
    expect(taxIdKind("529.982.247-24")).toBeNull();
    expect(taxIdKind("12.345.678/0001-90")).toBeNull();
    expect(taxIdKind("111.111.111-11")).toBeNull();
    expect(taxIdKind("00000000000000")).toBeNull();
    expect(taxIdKind("1234")).toBeNull();
    expect(taxIdKind("")).toBeNull();
  });

  it("formata e mascara durante a digitação", () => {
    expect(formatTaxId("52998224725")).toBe("529.982.247-25");
    expect(formatTaxId("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatTaxId(null)).toBe("");
    expect(maskTaxId("5299")).toBe("529.9");
    expect(maskTaxId("52998224725")).toBe("529.982.247-25");
    expect(maskTaxId("112223330001")).toBe("11.222.333/0001");
    expect(maskTaxId("11222333000181999")).toBe("11.222.333/0001-81");
  });
});
