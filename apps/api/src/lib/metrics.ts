/**
 * Métricas em memória no formato de exposição do Prometheus (texto).
 * Sem dependência externa; agregados do banco são lidos na hora da coleta.
 */
const BUCKETS = [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export class Metrics {
  private requests = new Map<string, number>();
  private duration = new Map<string, { buckets: number[]; sum: number; count: number }>();
  private counters = new Map<string, number>();

  observeRequest(method: string, route: string, status: number, seconds: number) {
    const cls = `${Math.floor(status / 100)}xx`;
    const k = `method="${method}",route="${route}",status="${cls}"`;
    this.requests.set(k, (this.requests.get(k) ?? 0) + 1);
    const dk = `route="${route}"`;
    const d = this.duration.get(dk) ?? { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 };
    BUCKETS.forEach((b, i) => {
      if (seconds <= b) d.buckets[i]!++;
    });
    d.sum += seconds;
    d.count++;
    this.duration.set(dk, d);
  }

  inc(name: string, labels: Record<string, string>, by = 1) {
    const k = `${name}{${Object.entries(labels)
      .map(([a, b]) => `${a}="${b.replace(/"/g, "")}"`)
      .join(",")}}`;
    this.counters.set(k, (this.counters.get(k) ?? 0) + by);
  }

  render(
    gauges: { name: string; help: string; values: [Record<string, string>, number][] }[],
  ): string {
    const out: string[] = [];
    out.push("# HELP rebania_http_requests_total Requisições HTTP por rota e classe de status.");
    out.push("# TYPE rebania_http_requests_total counter");
    for (const [k, v] of this.requests) out.push(`rebania_http_requests_total{${k}} ${v}`);
    out.push("# HELP rebania_http_request_duration_seconds Latência por rota.");
    out.push("# TYPE rebania_http_request_duration_seconds histogram");
    for (const [k, d] of this.duration) {
      BUCKETS.forEach((b, i) =>
        out.push(`rebania_http_request_duration_seconds_bucket{${k},le="${b}"} ${d.buckets[i]}`),
      );
      out.push(`rebania_http_request_duration_seconds_bucket{${k},le="+Inf"} ${d.count}`);
      out.push(`rebania_http_request_duration_seconds_sum{${k}} ${d.sum.toFixed(6)}`);
      out.push(`rebania_http_request_duration_seconds_count{${k}} ${d.count}`);
    }
    const names = new Set([...this.counters.keys()].map((k) => k.slice(0, k.indexOf("{"))));
    for (const n of names) {
      out.push(`# TYPE ${n} counter`);
      for (const [k, v] of this.counters) if (k.startsWith(`${n}{`)) out.push(`${k} ${v}`);
    }
    for (const g of gauges) {
      out.push(`# HELP ${g.name} ${g.help}`);
      out.push(`# TYPE ${g.name} gauge`);
      for (const [labels, v] of g.values) {
        const l = Object.entries(labels)
          .map(([a, b]) => `${a}="${b}"`)
          .join(",");
        out.push(`${g.name}${l ? `{${l}}` : ""} ${v}`);
      }
    }
    return out.join("\n") + "\n";
  }
}
