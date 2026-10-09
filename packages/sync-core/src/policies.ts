import type { SyncMutationType } from "@rebania/contracts";

/**
 * Política de merge por tipo de mutação. Não existe last-write-wins universal:
 * - append: registros independentes coexistem (pesagens, fotos).
 * - idempotent_create: criação com ID gerado no aparelho; reenvio devolve o mesmo recibo.
 * - version_check: exige `expectedVersion`; divergência vira conflito para revisão humana.
 */
export type MergePolicy = "append" | "idempotent_create" | "version_check";

export const MERGE_POLICY: Record<SyncMutationType, MergePolicy> = {
  "animal.create": "idempotent_create",
  "animal.update": "version_check",
  "animal.move": "version_check",
  "weight.record": "append",
  // Operações reprodutivas criam registros novos (idempotentes por operação);
  // o servidor valida cada animal e devolve exceções em vez de sobrescrever.
  "breeding.record": "append",
  "pregnancy.record": "append",
  "birth.record": "idempotent_create",
  "weaning.record": "append",
};

/** Backoff exponencial com teto e jitter determinístico opcional (para testes). */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base / 2 + (base / 2) * random());
}
