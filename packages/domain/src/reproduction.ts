/**
 * Indicadores reprodutivos com denominador explícito por coorte.
 * Ausência de diagnóstico NÃO equivale a vazia: é reportada como cobertura.
 */
export type PregnancyResult = "pregnant" | "open" | "inconclusive";

export interface CohortMember {
  animalId: string;
  lastResult: PregnancyResult | null;
}

export interface PregnancyRate {
  exposed: number;
  diagnosed: number;
  pregnant: number;
  open: number;
  inconclusive: number;
  notDiagnosed: number;
  /** prenhes / diagnosticadas conclusivamente; null sem base */
  rateAmongDiagnosed: number | null;
  /** diagnosticadas / expostas */
  coverage: number | null;
}

export function pregnancyRate(cohort: CohortMember[]): PregnancyRate {
  let pregnant = 0;
  let open = 0;
  let inconclusive = 0;
  for (const m of cohort) {
    if (m.lastResult === "pregnant") pregnant++;
    else if (m.lastResult === "open") open++;
    else if (m.lastResult === "inconclusive") inconclusive++;
  }
  const exposed = cohort.length;
  const diagnosed = pregnant + open + inconclusive;
  const conclusive = pregnant + open;
  return {
    exposed,
    diagnosed,
    pregnant,
    open,
    inconclusive,
    notDiagnosed: exposed - diagnosed,
    rateAmongDiagnosed: conclusive === 0 ? null : round4(pregnant / conclusive),
    coverage: exposed === 0 ? null : round4(diagnosed / exposed),
  };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
