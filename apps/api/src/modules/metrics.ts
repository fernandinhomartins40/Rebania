import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../lib/context.ts";
import { notFound } from "../lib/errors.ts";
import { Metrics } from "../lib/metrics.ts";

/**
 * Observabilidade (G7): latência/erros por rota (memória) + agregados do banco
 * coletados na hora: recibos de sync por status, fila de jobs, uso e custo de IA.
 */
export function metricsRoutes(app: FastifyInstance, ctx: AppContext) {
  const metrics = new Metrics();
  const { db, config } = ctx;

  app.addHook("onResponse", async (req, reply) => {
    const route = req.routeOptions.url ?? "unmatched";
    if (route === "/v1/metrics") return;
    metrics.observeRequest(req.method, route, reply.statusCode, reply.elapsedTime / 1000);
  });

  app.get("/v1/metrics", { config: { rateLimit: false } }, async (req, reply) => {
    const token = config.metricsToken;
    const got = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    if (
      !token ||
      got.length !== token.length ||
      !timingSafeEqual(Buffer.from(got), Buffer.from(token))
    )
      throw notFound("Recurso");
    const since = new Date(ctx.now().getTime() - 24 * 3600_000);
    const [receipts, jobs, failedJobs, ai] = await Promise.all([
      db.$queryRaw<{ status: string; n: bigint }[]>`
        SELECT receipt->>'status' AS status, count(*) AS n FROM sync_mutations
        WHERE created_at >= ${since} GROUP BY 1`,
      db.job.groupBy({ by: ["queue", "status"], _count: { _all: true } }),
      db.job.count({ where: { status: "failed" } }),
      db.aiUsage.groupBy({
        by: ["status", "action"],
        where: { createdAt: { gte: since } },
        _sum: { credits: true, inputTokens: true, outputTokens: true },
        _count: { _all: true },
      }),
    ]);
    reply.header("content-type", "text/plain; version=0.0.4; charset=utf-8");
    return metrics.render([
      {
        name: "rebania_sync_receipts_24h",
        help: "Mutações recebidas nas últimas 24 h por status (accepted, rejected, conflict).",
        values: receipts.map((r) => [{ status: r.status ?? "unknown" }, Number(r.n)]),
      },
      {
        name: "rebania_jobs",
        help: "Jobs na fila por fila e status.",
        values: jobs.map((j) => [{ queue: j.queue, status: j.status }, j._count._all]),
      },
      {
        name: "rebania_jobs_failed",
        help: "Jobs que esgotaram as tentativas.",
        values: [[{}, failedJobs]],
      },
      {
        name: "rebania_ai_requests_24h",
        help: "Perguntas ao assistente nas últimas 24 h por status.",
        values: ai.map((a) => [{ status: a.status, action: a.action }, a._count._all]),
      },
      {
        name: "rebania_ai_credits_24h",
        help: "Créditos consumidos nas últimas 24 h por ação.",
        values: ai.map((a) => [{ status: a.status, action: a.action }, a._sum.credits ?? 0]),
      },
      {
        name: "rebania_ai_tokens_24h",
        help: "Tokens (entrada+saída) do provedor nas últimas 24 h por ação.",
        values: ai.map((a) => [
          { status: a.status, action: a.action },
          (a._sum.inputTokens ?? 0) + (a._sum.outputTokens ?? 0),
        ]),
      },
    ]);
  });
}
