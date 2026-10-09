import { DomainError } from "./errors.ts";

/**
 * Datas civis da fazenda são strings ISO `YYYY-MM-DD`, interpretadas no timezone
 * configurado da fazenda. Timestamps técnicos são sempre UTC (`Date`/ISO completo).
 */
export type CivilDate = string;

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCivilDate(value: string): value is CivilDate {
  const m = CIVIL_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function assertCivilDate(value: string, field = "date"): CivilDate {
  if (!isCivilDate(value)) {
    throw new DomainError("invalid_date", `Data inválida em ${field}.`, { field, value });
  }
  return value;
}

function toUtcMidnight(date: CivilDate): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

/** Dias corridos de `from` até `to` (pode ser negativo). */
export function daysBetween(from: CivilDate, to: CivilDate): number {
  return Math.round((toUtcMidnight(to) - toUtcMidnight(from)) / 86_400_000);
}

export function addDays(date: CivilDate, days: number): CivilDate {
  return new Date(toUtcMidnight(date) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Data civil "hoje" no timezone da fazenda (ex.: `America/Sao_Paulo`). */
export function todayInTimezone(timeZone: string, now: Date = new Date()): CivilDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

export function isValidTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Idade em meses completos entre nascimento e referência. */
export function ageInMonths(birth: CivilDate, reference: CivilDate): number {
  const [by, bm, bd] = birth.split("-").map(Number) as [number, number, number];
  const [ry, rm, rd] = reference.split("-").map(Number) as [number, number, number];
  let months = (ry - by) * 12 + (rm - bm);
  if (rd < bd) months -= 1;
  return Math.max(0, months);
}
