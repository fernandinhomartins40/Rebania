/**
 * Supressão de leituras repetidas no Modo Curral (MN §7):
 * - a mesma tag lida várias vezes em sequência (bastão parado no brinco) é ignorada
 *   dentro de `windowMs`;
 * - o RETORNO INTENCIONAL do mesmo animal é permitido depois que outra tag for
 *   lida ou após a janela — e é sinalizado como repetição para o operador decidir.
 */
export class ReadDeduper {
  private last: { value: string; at: number } | null = null;
  private seen = new Map<string, number>();

  constructor(private readonly windowMs = 5_000) {}

  /** Retorna "new" (primeira vez na sessão), "repeat" (já manejado nesta sessão) ou "suppressed". */
  accept(value: string, at: number): "new" | "repeat" | "suppressed" {
    if (this.last && this.last.value === value && at - this.last.at < this.windowMs) {
      this.last = { value, at };
      return "suppressed";
    }
    this.last = { value, at };
    const count = this.seen.get(value) ?? 0;
    this.seen.set(value, count + 1);
    return count === 0 ? "new" : "repeat";
  }

  reset() {
    this.last = null;
    this.seen.clear();
  }

  /** Para retomar sessão após reinício do app. */
  restore(values: string[]) {
    for (const v of values) this.seen.set(v, Math.max(1, this.seen.get(v) ?? 0));
  }
}
