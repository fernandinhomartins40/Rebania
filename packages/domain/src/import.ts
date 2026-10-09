import { CATEGORY_SEX, type Category, type Origin, type Sex } from "./animal.ts";
import { isCivilDate, type CivilDate } from "./dates.ts";
import { DomainError } from "./errors.ts";
import { normalizeIdentifier } from "./identifiers.ts";
import { assertWeightKg } from "./weight.ts";

/**
 * Importação de planilha (T15): preparar arquivo → revisar → confirmar.
 * Funções puras: o servidor revalida tudo antes de gravar.
 */

/** Parser CSV (RFC 4180) com detecção de separador ";" ou ",". */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export const IMPORT_COLUMNS = [
  "brinco",
  "rfid",
  "sexo",
  "categoria",
  "raca",
  "nascimento",
  "origem",
  "entrada",
  "lote",
  "peso",
  "data_peso",
  "observacoes",
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
export type RawRow = Partial<Record<ImportColumn, string>>;

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Mapeia o cabeçalho da planilha para as colunas conhecidas (aceita variações comuns). */
export function mapHeader(header: string[]): (ImportColumn | null)[] {
  const aliases: Record<string, ImportColumn> = {
    brinco: "brinco",
    "brinco visual": "brinco",
    numero: "brinco",
    "n brinco": "brinco",
    rfid: "rfid",
    "brinco eletronico": "rfid",
    sisbov: "rfid",
    sexo: "sexo",
    categoria: "categoria",
    raca: "raca",
    nascimento: "nascimento",
    "data nascimento": "nascimento",
    "data de nascimento": "nascimento",
    origem: "origem",
    entrada: "entrada",
    "data entrada": "entrada",
    "data de entrada": "entrada",
    lote: "lote",
    peso: "peso",
    "peso kg": "peso",
    "data peso": "data_peso",
    data_peso: "data_peso",
    "data da pesagem": "data_peso",
    observacoes: "observacoes",
    obs: "observacoes",
  };
  return header.map(
    (h) =>
      aliases[
        strip(h)
          .replace(/[()_.:]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      ] ??
      aliases[strip(h)] ??
      null,
  );
}

const CATEGORY_ALIASES: Record<string, Category> = {
  bezerra: "calf_female",
  bezerro: "calf_male",
  novilha: "heifer",
  garrote: "steer",
  novilho: "steer",
  vaca: "cow",
  matriz: "cow",
  touro: "bull",
  reprodutor: "bull",
  boi: "ox",
};
const ORIGIN_ALIASES: Record<string, Origin> = {
  comprado: "purchased",
  compra: "purchased",
  nascido: "born_on_farm",
  "nascido na fazenda": "born_on_farm",
  nascimento: "born_on_farm",
  transferido: "transferred_in",
  transferencia: "transferred_in",
  desconhecida: "unknown",
  desconhecido: "unknown",
};

/** Aceita AAAA-MM-DD ou DD/MM/AAAA. */
export function parseDate(v: string): CivilDate | null {
  const t = v.trim();
  if (isCivilDate(t)) return t;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return isCivilDate(iso) ? iso : null;
}

export interface ParsedRow {
  tag: string;
  rfid: string | null;
  sex: Sex;
  category: Category;
  breed: string | null;
  birthDate: CivilDate | null;
  origin: Origin;
  entryDate: CivilDate | null;
  groupName: string | null;
  weightKg: number | null;
  weighedOn: CivilDate | null;
  notes: string | null;
}

export type RowResult = { ok: true; value: ParsedRow } | { ok: false; errors: string[] };

export function parseHerdRow(raw: RawRow, today: CivilDate): RowResult {
  const errors: string[] = [];
  const get = (c: ImportColumn) => (raw[c] ?? "").trim();

  let tag = "";
  try {
    tag = normalizeIdentifier("visual_tag", get("brinco"));
  } catch {
    errors.push("Brinco obrigatório.");
  }
  let rfid: string | null = null;
  if (get("rfid")) {
    try {
      rfid = normalizeIdentifier("rfid", get("rfid"));
    } catch (e) {
      errors.push(e instanceof DomainError ? e.message : "RFID inválido.");
    }
  }
  const category = CATEGORY_ALIASES[strip(get("categoria"))];
  if (!category)
    errors.push(
      `Categoria "${get("categoria")}" não reconhecida (use Vaca, Novilha, Bezerra, Bezerro, Garrote, Boi ou Touro).`,
    );
  const sexRaw = strip(get("sexo"));
  let sex: Sex | undefined = ["f", "femea", "female"].includes(sexRaw)
    ? "female"
    : ["m", "macho", "male"].includes(sexRaw)
      ? "male"
      : undefined;
  if (!sexRaw && category) sex = CATEGORY_SEX[category];
  if (!sex) errors.push(`Sexo "${get("sexo")}" não reconhecido (use F ou M).`);
  if (sex && category && CATEGORY_SEX[category] !== sex)
    errors.push("Categoria incompatível com o sexo.");

  const date = (c: ImportColumn, label: string) => {
    if (!get(c)) return null;
    const d = parseDate(get(c));
    if (!d) {
      errors.push(`${label} inválida (use DD/MM/AAAA).`);
      return null;
    }
    if (d > today) errors.push(`${label} no futuro.`);
    return d;
  };
  const birthDate = date("nascimento", "Data de nascimento");
  const entryDate = date("entrada", "Data de entrada");
  const weighedOnRaw = date("data_peso", "Data da pesagem");
  if (birthDate && entryDate && entryDate < birthDate) errors.push("Entrada antes do nascimento.");

  let origin: Origin = "unknown";
  if (get("origem")) {
    const o = ORIGIN_ALIASES[strip(get("origem"))];
    if (!o) errors.push(`Origem "${get("origem")}" não reconhecida.`);
    else origin = o;
  }

  let weightKg: number | null = null;
  if (get("peso")) {
    const n = Number(
      get("peso")
        .replace(/\./g, (m, i, s: string) => (s.includes(",") ? "" : m))
        .replace(",", "."),
    );
    try {
      assertWeightKg(n);
      weightKg = n;
    } catch (e) {
      errors.push(e instanceof DomainError ? e.message : "Peso inválido.");
    }
  }
  const weighedOn = weightKg !== null ? (weighedOnRaw ?? entryDate ?? today) : null;
  if (weighedOn && birthDate && weighedOn < birthDate) errors.push("Pesagem antes do nascimento.");

  if (errors.length || !category || !sex) return { ok: false, errors };
  return {
    ok: true,
    value: {
      tag,
      rfid,
      sex,
      category,
      breed: get("raca") || null,
      birthDate,
      origin,
      entryDate,
      groupName: get("lote") || null,
      weightKg,
      weighedOn,
      notes: get("observacoes") || null,
    },
  };
}

/** Modelo de planilha para download. */
export function importTemplateCsv(): string {
  return [
    IMPORT_COLUMNS.join(";"),
    "0284;982 000123456789;F;Vaca;Nelore;10/03/2021;Comprado;15/01/2024;Lote 03;462;10/09/2026;",
  ].join("\n");
}
