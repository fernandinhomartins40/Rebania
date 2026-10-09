import { addDays, daysBetween, type CivilDate } from "./dates.ts";
import type { Category } from "./animal.ts";
import { DomainError } from "./errors.ts";

/**
 * Reprodução de corte. Regras determinísticas; parâmetros técnicos (gestação,
 * prazo de diagnóstico, idade de desmama) são CONFIGURADOS pela fazenda.
 */
export interface ReproSettings {
  /** Duração média de gestação usada nas estimativas (dias). */
  gestationDays: number;
  /** Margem (±dias) exibida na previsão de parto. */
  calvingWindowDays: number;
  /** Dias após a cobertura/IA para agendar o diagnóstico de prenhez. */
  pregnancyCheckAfterDays: number;
  /** Idade (dias) sugerida para a desmama. */
  weaningAgeDays: number;
}

export const DEFAULT_REPRO_SETTINGS: ReproSettings = {
  gestationDays: 290,
  calvingWindowDays: 10,
  pregnancyCheckAfterDays: 30,
  weaningAgeDays: 210,
};

export function parseReproSettings(raw: unknown): ReproSettings {
  const r = (raw ?? {}) as Partial<ReproSettings>;
  const n = (v: unknown, d: number, min: number, max: number) =>
    typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : d;
  return {
    gestationDays: n(r.gestationDays, DEFAULT_REPRO_SETTINGS.gestationDays, 260, 310),
    calvingWindowDays: n(r.calvingWindowDays, DEFAULT_REPRO_SETTINGS.calvingWindowDays, 0, 30),
    pregnancyCheckAfterDays: n(
      r.pregnancyCheckAfterDays,
      DEFAULT_REPRO_SETTINGS.pregnancyCheckAfterDays,
      25,
      120,
    ),
    weaningAgeDays: n(r.weaningAgeDays, DEFAULT_REPRO_SETTINGS.weaningAgeDays, 90, 300),
  };
}

export const BREEDING_KINDS = [
  "artificial_insemination",
  "natural_service",
  "cleanup_bull",
] as const;
export type BreedingKind = (typeof BREEDING_KINDS)[number];
export const BREEDING_LABEL: Record<BreedingKind, string> = {
  artificial_insemination: "Inseminação artificial",
  natural_service: "Monta natural",
  cleanup_bull: "Repasse",
};

export const PREGNANCY_RESULTS = ["pregnant", "open", "inconclusive"] as const;
export type PregnancyResultValue = (typeof PREGNANCY_RESULTS)[number];
export const PREGNANCY_LABEL: Record<PregnancyResultValue, string> = {
  pregnant: "Prenha",
  open: "Vazia",
  inconclusive: "Inconclusivo",
};

export const REPRO_STATUSES = ["open", "bred", "pregnant", "unknown"] as const;
export type ReproStatus = (typeof REPRO_STATUSES)[number];
export const REPRO_STATUS_LABEL: Record<ReproStatus, string> = {
  open: "Vazia",
  bred: "Inseminada/coberta",
  pregnant: "Prenha",
  unknown: "Sem informação",
};

export const ASSISTANCE = ["none", "easy", "hard", "cesarean"] as const;
export type Assistance = (typeof ASSISTANCE)[number];
export const ASSISTANCE_LABEL: Record<Assistance, string> = {
  none: "Sem auxílio",
  easy: "Auxílio leve",
  hard: "Auxílio difícil",
  cesarean: "Cesariana",
};

const BREEDABLE: Category[] = ["heifer", "cow"];

export function assertBreedable(category: Category) {
  if (!BREEDABLE.includes(category)) {
    throw new DomainError(
      "not_breedable",
      "Somente novilhas e vacas recebem cobertura, inseminação ou diagnóstico.",
    );
  }
}

export function assertCanCalve(category: Category) {
  if (!BREEDABLE.includes(category)) {
    throw new DomainError("not_breedable", "Somente novilhas e vacas podem parir.");
  }
}

/** Histórico reprodutivo mínimo de uma fêmea (eventos não anulados). */
export interface ReproHistory {
  breedings: { date: CivilDate; endDate?: CivilDate | null }[];
  checks: {
    date: CivilDate;
    result: PregnancyResultValue;
    estimatedGestationDays?: number | null;
  }[];
  births: { date: CivilDate }[];
}

export interface ReproProjection {
  status: ReproStatus;
  since: CivilDate | null;
  expectedCalving: ExpectedCalving | null;
}

export interface ExpectedCalving {
  date: CivilDate;
  windowStart: CivilDate;
  windowEnd: CivilDate;
  /** Explicação humana da origem do cálculo (sempre exibida). */
  source: string;
  basis: "breeding" | "ultrasound";
}

const fmt = (d: CivilDate) => d.split("-").reverse().join("/");

/**
 * Situação reprodutiva atual a partir do histórico. Regras:
 * - o parto mais recente "zera" o ciclo;
 * - diagnóstico posterior à última cobertura define prenha/vazia (inconclusivo mantém "coberta");
 * - cobertura sem diagnóstico = "coberta/inseminada" (NÃO é vazia);
 * - previsão de parto só existe com base declarada (cobertura única ou idade gestacional do ultrassom).
 */
export function projectRepro(h: ReproHistory, s: ReproSettings): ReproProjection {
  const lastBirth =
    h.births
      .map((b) => b.date)
      .sort()
      .at(-1) ?? null;
  const after = (d: CivilDate) => !lastBirth || d > lastBirth;
  const breedings = h.breedings
    .filter((b) => after(b.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const checks = h.checks.filter((c) => after(c.date)).sort((a, b) => a.date.localeCompare(b.date));
  const lastBreeding = breedings.at(-1) ?? null;
  const lastCheck = checks.at(-1) ?? null;

  if (!lastBreeding && !lastCheck) {
    return { status: lastBirth ? "open" : "unknown", since: lastBirth, expectedCalving: null };
  }
  if (lastCheck && (!lastBreeding || lastCheck.date >= lastBreeding.date)) {
    if (lastCheck.result === "pregnant") {
      return {
        status: "pregnant",
        since: lastCheck.date,
        expectedCalving: estimateCalving(breedings, lastCheck, s),
      };
    }
    if (lastCheck.result === "open")
      return { status: "open", since: lastCheck.date, expectedCalving: null };
  }
  return {
    status: "bred",
    since: lastBreeding?.date ?? lastCheck?.date ?? null,
    expectedCalving: null,
  };
}

function estimateCalving(
  breedings: ReproHistory["breedings"],
  check: ReproHistory["checks"][number],
  s: ReproSettings,
): ExpectedCalving | null {
  const win = s.calvingWindowDays;
  if (check.estimatedGestationDays && check.estimatedGestationDays > 0) {
    const date = addDays(check.date, s.gestationDays - check.estimatedGestationDays);
    return {
      date,
      windowStart: addDays(date, -win),
      windowEnd: addDays(date, win),
      basis: "ultrasound",
      source: `Diagnóstico de ${fmt(check.date)} com ${check.estimatedGestationDays} dias de gestação + gestação de ${s.gestationDays} dias (configuração da fazenda)`,
    };
  }
  const before = breedings.filter((b) => b.date <= check.date);
  const last = before.at(-1);
  if (!last) return null;
  if (last.endDate && last.endDate !== last.date) {
    // Exposição em período (monta natural): janela larga, sem data única.
    return {
      date: addDays(
        last.date,
        s.gestationDays + Math.round(daysBetween(last.date, last.endDate) / 2),
      ),
      windowStart: addDays(last.date, s.gestationDays - win),
      windowEnd: addDays(last.endDate, s.gestationDays + win),
      basis: "breeding",
      source: `Exposição de ${fmt(last.date)} a ${fmt(last.endDate)} + gestação de ${s.gestationDays} dias (estimativa ampla)`,
    };
  }
  const date = addDays(last.date, s.gestationDays);
  const multiple = before.length > 1 ? " (houve mais de uma cobertura; usada a última)" : "";
  return {
    date,
    windowStart: addDays(date, -win),
    windowEnd: addDays(date, win),
    basis: "breeding",
    source: `Cobertura/IA de ${fmt(last.date)} + gestação de ${s.gestationDays} dias${multiple}`,
  };
}

/** Promoção de categoria por evento reprodutivo/desmama. */
export function categoryAfterCalving(c: Category): Category {
  return c === "heifer" ? "cow" : c;
}

export function categoryAfterWeaning(c: Category): Category {
  if (c === "calf_female") return "heifer";
  if (c === "calf_male") return "steer";
  return c;
}

export const MAX_CALVES_PER_BIRTH = 4;
