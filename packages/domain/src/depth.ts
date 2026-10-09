import { DomainError } from "./errors.ts";

/**
 * G8 — módulos de profundidade, cada um atrás de chave por fazenda (MN §16).
 * Desligados por padrão: só aparecem quando a fazenda ativa em Configurações.
 */
export const FEATURES = ["confinement", "slaughter", "result", "pasture", "assets"] as const;
export type Feature = (typeof FEATURES)[number];
export const FEATURE_LABEL: Record<Feature, { title: string; desc: string }> = {
  confinement: {
    title: "Confinamento",
    desc: "Baias, leitura de cocho, trato por baia e fechamento.",
  },
  slaughter: {
    title: "Abate e retorno do frigorífico",
    desc: "Peso de carcaça real, rendimento e comparação com a estimativa.",
  },
  result: {
    title: "Resultado (DRE gerencial)",
    desc: "Receitas, custos e resultado por período e por lote.",
  },
  pasture: { title: "Pastagem", desc: "Área, ocupação e descanso dos pastos; registro de chuva." },
  assets: { title: "Patrimônio", desc: "Máquinas, veículos e instalações com manutenção." },
};

export type FeatureFlags = Record<Feature, boolean>;

export function parseFeatures(raw: unknown): FeatureFlags {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(FEATURES.map((f) => [f, o[f] === true])) as FeatureFlags;
}

export function assertFeature(flags: FeatureFlags, f: Feature) {
  if (!flags[f])
    throw new DomainError(
      "feature_disabled",
      `Módulo "${FEATURE_LABEL[f].title}" desativado nesta fazenda.`,
    );
}

// ---- Ocorrências (T42) -------------------------------------------------------------

export const OCCURRENCE_SEVERITIES = ["low", "medium", "high"] as const;
export type OccurrenceSeverity = (typeof OCCURRENCE_SEVERITIES)[number];
export const SEVERITY_LABEL: Record<OccurrenceSeverity, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};
export const OCCURRENCE_TARGETS = ["animal", "group", "pasture", "equipment", "other"] as const;
export type OccurrenceTarget = (typeof OCCURRENCE_TARGETS)[number];
export const OCCURRENCE_TARGET_LABEL: Record<OccurrenceTarget, string> = {
  animal: "Animal",
  group: "Lote / baia",
  pasture: "Pasto",
  equipment: "Equipamento",
  other: "Outro",
};

// ---- Confinamento -------------------------------------------------------------------

/** Escore de cocho na escala adotada pela fazenda (0 a 5); o Rebania não prescreve ajuste. */
export function assertBunkScore(score: number) {
  if (!Number.isInteger(score) || score < 0 || score > 5)
    throw new DomainError("invalid_bunk_score", "Escore de cocho deve ser um inteiro de 0 a 5.");
}

export interface PenClosing {
  heads: number;
  days: number;
  liveGainKg: number | null;
  feedCostCents: number | null;
  costPerHeadDayCents: number | null;
  costPerKgGainCents: number | null;
}

export function penClosing(p: {
  heads: number;
  days: number;
  liveGainKg: number | null;
  feedCostCents: number | null;
}): PenClosing {
  const hd = p.heads * p.days;
  return {
    ...p,
    costPerHeadDayCents:
      p.feedCostCents !== null && hd > 0 ? Math.round(p.feedCostCents / hd) : null,
    costPerKgGainCents:
      p.feedCostCents !== null && p.liveGainKg && p.liveGainKg > 0
        ? Math.round(p.feedCostCents / p.liveGainKg)
        : null,
  };
}

// ---- Abate ---------------------------------------------------------------------------

/** Resultado REAL do frigorífico: carcaça/peso vivo e arrobas de carcaça (15 kg). */
export function realCarcass(liveKg: number | null, carcassKg: number) {
  if (!(carcassKg > 0 && carcassKg <= 1000))
    throw new DomainError("invalid_carcass", "Peso de carcaça inválido.");
  return {
    arrobas: Math.round((carcassKg / 15) * 100) / 100,
    yieldPercent: liveKg && liveKg > 0 ? Math.round((carcassKg / liveKg) * 10000) / 100 : null,
  };
}

// ---- Pastagem ------------------------------------------------------------------------

export function assertRainMm(mm: number) {
  if (!(mm >= 0 && mm <= 500))
    throw new DomainError("invalid_rain", "Chuva deve ficar entre 0 e 500 mm.");
}

export const ASSET_KINDS = ["machine", "vehicle", "implement", "facility", "other"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  machine: "Máquina",
  vehicle: "Veículo",
  implement: "Implemento",
  facility: "Instalação",
  other: "Outro",
};
