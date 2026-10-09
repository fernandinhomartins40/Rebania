import { describe, expect, it } from "vitest";
import { KeyboardWedgeReader, parseRfidLine, parseScaleLine, ReadDeduper } from "./index.ts";

describe("parseRfidLine", () => {
  it.each([
    ["982 000123456789", "982000123456789"],
    ["982000123456789\r\n", "982000123456789"],
    ["FDX-B 982 000123456789", "982000123456789"],
    ["HDX 076-000000012345", "076000000012345"],
  ])("%s", (line, expected) => expect(parseRfidLine(line)).toBe(expected));
  it("não adivinha formatos desconhecidos", () => {
    expect(parseRfidLine("0512")).toBeNull();
    expect(parseRfidLine("")).toBeNull();
  });
});

describe("parseScaleLine", () => {
  it("lê estável/instável", () => {
    expect(parseScaleLine("ST,GS,+  0462.5kg")).toEqual({ weightKg: 462.5, stable: true });
    expect(parseScaleLine("US,GS,+  0461.0kg")).toEqual({ weightKg: 461, stable: false });
    expect(parseScaleLine("W: 462,5 kg")).toEqual({ weightKg: 462.5, stable: true });
  });
  it("rejeita zero/lixo", () => {
    expect(parseScaleLine("ST,GS,+  0000.0kg")).toBeNull();
    expect(parseScaleLine("ERRO")).toBeNull();
  });
});

describe("ReadDeduper", () => {
  it("suprime leitura repetida imediata e sinaliza retorno intencional", () => {
    const d = new ReadDeduper(5000);
    expect(d.accept("A", 0)).toBe("new");
    expect(d.accept("A", 1000)).toBe("suppressed");
    expect(d.accept("B", 2000)).toBe("new");
    expect(d.accept("A", 3000)).toBe("repeat");
    expect(d.accept("A", 9000)).toBe("repeat");
  });
  it("retoma sessão após reinício", () => {
    const d = new ReadDeduper();
    d.restore(["A"]);
    expect(d.accept("A", 0)).toBe("repeat");
  });
});

describe("KeyboardWedgeReader", () => {
  it("emite leitura RFID ou brinco e ignora quando desconectado", async () => {
    const r = new KeyboardWedgeReader(() => 42);
    const reads: string[] = [];
    r.onRead((x) => reads.push(`${x.type}:${x.value}`));
    expect(r.submitLine("982 000123456789")).toBeNull();
    await r.connect();
    r.submitLine("982 000123456789");
    r.submitLine(" 0512 ");
    expect(reads).toEqual(["rfid:982000123456789", "visual_tag:0512"]);
  });
});
