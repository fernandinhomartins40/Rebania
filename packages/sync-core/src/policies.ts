import type { SyncMutationType } from "@rebania/contracts";

/**
 * Política de merge por tipo de mutação. Não existe last-write-wins universal:
 * - append: registros independentes coexistem (pesagens, fotos).
 * - idempotent_create: criação com ID gerado no aparelho; reenvio devolve o mesmo recibo.
 * - version_check: exige `expectedVersion`; divergência vira conflito para revisão humana.
 * - state_check: o servidor confere o estado atual (ex.: animal ainda ativo); se outro
 *   aparelho já vendeu/baixou o animal, vira CONFLITO — nunca reabre em silêncio.
 */
export type MergePolicy = "append" | "idempotent_create" | "version_check" | "state_check";

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
  // Aplicações e marcações do Curral são fatos de campo: nunca bloqueadas por saldo
  // de estoque (o servidor marca para reconciliação). Marcação é idempotente por
  // sessão+animal; abrir/encerrar sessão é criação/transição idempotente.
  "health.apply": "append",
  "handling.open": "idempotent_create",
  "handling.mark": "append",
  "handling.exception": "append",
  "handling.close": "idempotent_create",
  "feeding.record": "append",
  "animal.exit": "state_check",
  "sale.record": "state_check",
};

/** Backoff exponencial com teto e jitter determinístico opcional (para testes). */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base / 2 + (base / 2) * random());
}
