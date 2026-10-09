import { describe, expect, it } from "vitest";
import { mapHeader, parseCsv, parseDate, parseHerdRow } from "./import.ts";

describe("importação", () => {
  it("lê CSV com ; e aspas", () => {
    expect(parseCsv('brinco;obs\n0284;"tem ; ponto e vírgula"\n\n0512;"aspas ""duplas"""')).toEqual(
      [
        ["brinco", "obs"],
        ["0284", "tem ; ponto e vírgula"],
        ["0512", 'aspas "duplas"'],
      ],
    );
  });
  it("lê CSV com vírgula e BOM", () => {
    expect(parseCsv("﻿a,b\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
  it("mapeia cabeçalhos com acento e variações", () => {
    expect(mapHeader(["Brinco", "Raça", "Data de Nascimento", "Peso (kg)", "xyz"])).toEqual([
      "brinco",
      "raca",
      "nascimento",
      "peso",
      null,
    ]);
  });
  it("datas BR e ISO", () => {
    expect(parseDate("05/01/2024")).toBe("2024-01-05");
    expect(parseDate("2024-01-05")).toBe("2024-01-05");
    expect(parseDate("31/02/2024")).toBeNull();
  });
  it("linha válida", () => {
    const r = parseHerdRow(
      {
        brinco: "0284",
        rfid: "982 000123456789",
        sexo: "F",
        categoria: "Matriz",
        nascimento: "10/03/2021",
        peso: "462,5",
        data_peso: "10/09/2026",
        lote: "Lote 03",
      },
      "2026-10-08",
    );
    expect(r).toMatchObject({
      ok: true,
      value: {
        tag: "0284",
        rfid: "982000123456789",
        category: "cow",
        weightKg: 462.5,
        weighedOn: "2026-09-10",
        groupName: "Lote 03",
      },
    });
  });
  it("sexo deduzido da categoria", () => {
    const r = parseHerdRow({ brinco: "1", categoria: "Boi" }, "2026-10-08");
    expect(r.ok && r.value.sex).toBe("male");
  });
  it("reúne todos os erros da linha", () => {
    const r = parseHerdRow(
      { brinco: "", sexo: "M", categoria: "Vaca", nascimento: "40/40/2020", peso: "5" },
      "2026-10-08",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(4);
  });
});
