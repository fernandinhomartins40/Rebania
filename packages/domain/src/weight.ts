import { daysBetween, type CivilDate } from "./dates.ts";
import { DomainError } from "./errors.ts";

export const WEIGHT_SOURCES = ["manual", "scale", "import"] as const;
export type WeightSource = (typeof WEIGHT_SOURCES)[number];

/** Limites de plausibilidade para bovinos de corte, em kg vivo. */
export const MIN_WEIGHT_KG = 10;
export const MAX_WEIGHT_KG = 1500;

export function assertWeightKg(weightKg: number): void {
  if (!Number.isFinite(weightKg) || weightKg < MIN_WEIGHT_KG || weightKg > MAX_WEIGHT_KG) {
    throw new DomainError(
      "weight_out_of_range",
      `Peso fora do intervalo aceito (${MIN_WEIGHT_KG} a ${MAX_WEIGHT_KG} kg).`,
      { weightKg },
    );
  }
  if (Math.round(weightKg * 100) !== weightKg * 100) {
    throw new DomainError("weight_precision", "Use no máximo duas casas decimais no peso.");
  }
}

export interface WeightPoint {
  measuredOn: CivilDate;
  weightKg: number;
}

export type AdgResult =
  | { ok: true; adgKgPerDay: number; days: number; from: WeightPoint; to: WeightPoint }
  | { ok: false; reason: "insufficient_data" | "non_positive_interval" };

/**
 * GMD (ganho médio diário) = diferença de peso / dias entre duas medições válidas.
 * Intervalo precisa ser positivo; mesma data ou datas invertidas não geram GMD.
 */
export function averageDailyGain(from: WeightPoint, to: WeightPoint): AdgResult {
  const days = daysBetween(from.measuredOn, to.measuredOn);
  if (days <= 0) return { ok: false, reason: "non_positive_interval" };
  const adg = (to.weightKg - from.weightKg) / days;
  return { ok: true, adgKgPerDay: Math.round(adg * 1000) / 1000, days, from, to };
}

/** GMD entre a primeira e a última pesagem válidas de uma série. */
export function adgFromSeries(points: WeightPoint[]): AdgResult {
  if (points.length < 2) return { ok: false, reason: "insufficient_data" };
  const sorted = [...points].sort((a, b) => daysBetween(b.measuredOn, a.measuredOn));
  return averageDailyGain(sorted[0]!, sorted[sorted.length - 1]!);
}

/** GMD da última pesagem em relação à anterior (com data estritamente menor). */
export function latestAdg(points: WeightPoint[]): AdgResult {
  if (points.length < 2) return { ok: false, reason: "insufficient_data" };
  const sorted = [...points].sort((a, b) => daysBetween(b.measuredOn, a.measuredOn));
  const last = sorted[sorted.length - 1]!;
  for (let i = sorted.length - 2; i >= 0; i--) {
    const prev = sorted[i]!;
    if (daysBetween(prev.measuredOn, last.measuredOn) > 0) return averageDailyGain(prev, last);
  }
  return { ok: false, reason: "non_positive_interval" };
}

/**
 * Alerta de consistência: variação diária implausível em relação à pesagem anterior.
 * Não bloqueia o registro; pede confirmação.
 */
export const ADG_ALERT_THRESHOLD_KG = 3;

export function weightConsistencyWarning(
  previous: WeightPoint | undefined,
  next: WeightPoint,
): string | null {
  if (!previous) return null;
  const days = daysBetween(previous.measuredOn, next.measuredOn);
  if (days <= 0) return null;
  const adg = (next.weightKg - previous.weightKg) / days;
  if (Math.abs(adg) > ADG_ALERT_THRESHOLD_KG) {
    return `Variação de ${adg.toFixed(2)} kg/dia em relação à pesagem de ${previous.measuredOn}. Confira o peso.`;
  }
  return null;
}

/**
 * Arroba de carcaça (15 kg) estimada a partir de peso vivo. Exige rendimento de
 * carcaça explícito: peso vivo NÃO é automaticamente arroba. O resultado é sempre
 * uma estimativa e deve ser exibido como tal.
 */
export function estimateCarcassArrobas(liveWeightKg: number, carcassYieldPercent: number) {
  if (!(carcassYieldPercent > 0 && carcassYieldPercent <= 70)) {
    throw new DomainError("invalid_yield", "Rendimento de carcaça deve estar entre 0 e 70%.");
  }
  const carcassKg = (liveWeightKg * carcassYieldPercent) / 100;
  return {
    kind: "estimate" as const,
    carcassKg: Math.round(carcassKg * 100) / 100,
    arrobas: Math.round((carcassKg / 15) * 100) / 100,
    carcassYieldPercent,
  };
}
