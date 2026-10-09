import {
  AiGateway,
  AiUnavailableError,
  DisabledProvider,
  ProviderError,
} from "@rebania/ai-gateway";
import { DomainError } from "@rebania/domain";
import type { Prisma } from "@rebania/db";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { audit } from "../../lib/audit.ts";
import type { AppContext } from "../../lib/context.ts";
import { balanceOf, consume, currentRateCard, quote, release, reserve } from "../../lib/credits.ts";
import { HttpError, notFound } from "../../lib/errors.ts";
import { runIdempotent } from "../../lib/idempotency.ts";
import { replyReceipt } from "../../lib/ops.ts";
import { createTask } from "../../lib/tasks.ts";
import { requireFarm, type FarmContext } from "../../lib/tenant.ts";
import { requireAuth } from "../../plugins/auth.ts";
import { moveAnimal } from "../animals/service.ts";
import { applyHealth } from "../health/service.ts";
import { recordBreeding } from "../repro/service.ts";
import {
  buildTools,
  DRAFT_ACTIONS,
  payloadHash,
  SYSTEM_PROMPT,
  type DraftAction,
} from "./tools.ts";

type FarmParams = { Params: { farmId: string } };
type IdParams = { Params: { farmId: string; id: string } };

const AskInput = z.object({
  question: z.string().trim().min(2).max(2000),
  requestId: z.uuid(),
});

export function aiRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const gateway = ctx.ai ?? new AiGateway(new DisabledProvider());
  const farm = (req: FastifyRequest, perm: Parameters<typeof requireFarm>[3]) =>
    requireFarm(db, requireAuth(req).userId, (req.params as { farmId: string }).farmId, perm);

  /** Situação do assistente: provedor, tabela de créditos e saldo — sem segredos. */
  app.get<FarmParams>("/v1/farms/:farmId/ai/status", async (req) => {
    const fctx = await farm(req, "animals.read");
    const card = await currentRateCard(db);
    const askCost = card ? ((card.actions as Record<string, number>).ask ?? null) : null;
    return {
      enabled: gateway.available && askCost !== null,
      provider: gateway.provider.id,
      reason: !gateway.available
        ? gateway.unavailableReason
        : askCost === null
          ? "Tabela de créditos ainda não definida pela plataforma."
          : null,
      balance: await balanceOf(db, fctx.organizationId),
      askCost,
      rateCardVersion: card?.version ?? null,
    };
  });

  app.post<FarmParams>("/v1/farms/:farmId/ai/quotes", async (req) => {
    await farm(req, "animals.read");
    const { action } = z.object({ action: z.string().max(40) }).parse(req.body);
    return quote(db, action);
  });

  /**
   * Pergunta ao assistente. Reserva créditos ANTES (atômico), consome só com
   * resposta entregue e libera se o provedor falhar. Retry com o mesmo
   * requestId devolve a mesma resposta sem cobrar de novo.
   */
  app.post<FarmParams>("/v1/farms/:farmId/ai/ask", async (req, reply) => {
    const fctx = await farm(req, "animals.read");
    const input = AskInput.parse(req.body);
    const prior = await db.aiUsage.findFirst({
      where: { requestId: input.requestId, organizationId: fctx.organizationId, status: "ok" },
    });
    if (prior?.result) return prior.result;
    if (!gateway.available) {
      return reply
        .status(503)
        .send({ error: { code: "ai_unavailable", message: gateway.unavailableReason } });
    }
    let reservationId: string;
    try {
      const r = await reserve(db, {
        organizationId: fctx.organizationId,
        farmId: fctx.farmId,
        userId: fctx.userId,
        requestId: input.requestId,
        action: "ask",
        now: ctx.now(),
      });
      if (r.replay && r.reservation.status !== "reserved") {
        return reply.status(409).send({
          error: {
            code: "request_settled",
            message: "Esta pergunta já foi processada; envie como nova.",
          },
        });
      }
      reservationId = r.reservation.id;
    } catch (err) {
      if (err instanceof DomainError && err.code === "insufficient_credits")
        return reply.status(402).send({
          error: { code: err.code, message: `${err.message} O manejo manual continua normal.` },
        });
      if (
        err instanceof DomainError &&
        (err.code === "rate_card_missing" || err.code === "action_not_priced")
      )
        return reply.status(503).send({ error: { code: err.code, message: err.message } });
      throw err;
    }
    const drafts: { id: string; action: string; preview: unknown; hash: string }[] = [];
    const started = Date.now();
    try {
      const result = await gateway.run({
        system: SYSTEM_PROMPT,
        question: input.question,
        tools: buildTools(db, fctx, ctx.now, drafts),
        timeoutMs: 30_000,
      });
      await consume(db, reservationId, ctx.now());
      const res = await db.creditReservation.findUniqueOrThrow({ where: { id: reservationId } });
      const body = {
        answer: result.answer,
        drafts,
        toolCalls: result.toolCalls.map((t) => ({ name: t.name, ok: t.ok })),
        creditsUsed: res.amount,
        balance: await balanceOf(db, fctx.organizationId),
      };
      await db.aiUsage.create({
        data: {
          organizationId: fctx.organizationId,
          farmId: fctx.farmId,
          userId: fctx.userId,
          requestId: input.requestId,
          provider: gateway.provider.id,
          action: "ask",
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          credits: res.amount,
          status: "ok",
          latencyMs: Date.now() - started,
          result: body as unknown as Prisma.InputJsonValue,
        },
      });
      return body;
    } catch (err) {
      await release(db, reservationId, ctx.now(), "Falha do provedor de IA");
      await db.aiUsage.create({
        data: {
          organizationId: fctx.organizationId,
          farmId: fctx.farmId,
          userId: fctx.userId,
          requestId: input.requestId,
          provider: gateway.provider.id,
          action: "ask",
          credits: 0,
          status: "failed",
          error: err instanceof Error ? err.message.slice(0, 300) : "erro",
          latencyMs: Date.now() - started,
        },
      });
      if (err instanceof AiUnavailableError || err instanceof ProviderError) {
        return reply.status(503).send({
          error: {
            code: "ai_unavailable",
            message:
              "O assistente falhou e os créditos foram devolvidos. O manejo manual continua normal.",
          },
        });
      }
      throw err;
    }
  });

  app.get<FarmParams>("/v1/farms/:farmId/ai/drafts", async (req) => {
    const fctx = await farm(req, "animals.read");
    const rows = await db.aiDraft.findMany({
      where: {
        farmId: fctx.farmId,
        userId: fctx.userId,
        status: "pending",
        expiresAt: { gt: ctx.now() },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return {
      items: rows.map((d) => ({
        id: d.id,
        action: d.action,
        preview: d.preview,
        hash: d.hash,
        expiresAt: d.expiresAt.toISOString(),
      })),
    };
  });

  app.post<IdParams>("/v1/farms/:farmId/ai/drafts/:id/cancel", async (req) => {
    const fctx = await farm(req, "animals.read");
    const r = await db.aiDraft.updateMany({
      where: { id: req.params.id, farmId: fctx.farmId, userId: fctx.userId, status: "pending" },
      data: { status: "cancelled" },
    });
    if (!r.count) throw notFound("Rascunho");
    return { ok: true };
  });

  /**
   * Confirmação HUMANA do rascunho: revalida fazenda, permissão, validade, hash
   * (nada mudou por baixo) e as regras do domínio; executa uma única vez.
   */
  app.post<IdParams>("/v1/farms/:farmId/ai/drafts/:id/confirm", async (req, reply) => {
    const base = await farm(req, "animals.read");
    const { hash } = z.object({ hash: z.string().length(64) }).parse(req.body);
    const d = await db.aiDraft.findFirst({ where: { id: req.params.id, farmId: base.farmId } });
    if (!d) throw notFound("Rascunho");
    const action = d.action as DraftAction;
    const fctx: FarmContext = await farm(req, DRAFT_ACTIONS[action]);
    if (d.userId !== fctx.userId)
      throw new HttpError(403, "forbidden", "Somente quem pediu pode confirmar este rascunho.");
    if (d.hash !== hash || payloadHash(d.action, d.payload) !== d.hash)
      throw new HttpError(409, "draft_changed", "O rascunho mudou; revise antes de confirmar.");
    if (d.status === "pending" && d.expiresAt <= ctx.now()) {
      await db.aiDraft.update({ where: { id: d.id }, data: { status: "expired" } });
      throw new HttpError(410, "draft_expired", "Rascunho expirado; peça novamente ao assistente.");
    }
    if (d.status !== "pending" && d.status !== "confirmed")
      throw new HttpError(409, "draft_not_pending", "Rascunho cancelado ou expirado.");
    const meta = { now: ctx.now(), mutationId: d.id };
    const p = d.payload as Record<string, unknown>;
    const receipt = await runIdempotent({
      db,
      fctx,
      mutationId: d.id,
      type: `ai.${action}`,
      requestHash: d.hash,
      execute: async (tx) => {
        let out: { entityId: string; version: number | null; detail?: unknown };
        switch (action) {
          case "health.apply":
            out = await applyHealth(
              tx,
              fctx,
              { ...(p as object), operationId: d.id } as never,
              meta,
            );
            break;
          case "breeding.record":
            out = await recordBreeding(
              tx,
              fctx,
              { ...(p as object), operationId: d.id } as never,
              meta,
            );
            break;
          case "animal.move": {
            for (const a of p.animals as { id: string; version: number }[]) {
              const cur = await tx.animal.findFirst({ where: { id: a.id, farmId: fctx.farmId } });
              await moveAnimal(
                tx,
                fctx,
                a.id,
                {
                  expectedVersion: a.version,
                  groupId: p.groupId as string,
                  pastureId: cur?.pastureId ?? null,
                  effectiveOn: p.date as string,
                },
                meta,
              );
            }
            out = { entityId: d.id, version: null };
            break;
          }
          case "task.create": {
            const t = await createTask(tx, fctx, {
              type: "manual",
              title: p.title as string,
              dueOn: p.dueOn as string,
              animalIds: p.animalIds as string[],
              sourceType: "ai_draft",
              sourceId: d.id,
              dedupeKey: `ai:${d.id}`,
            });
            out = { entityId: t.id, version: null };
            break;
          }
        }
        await tx.aiDraft.update({
          where: { id: d.id },
          data: { status: "confirmed", confirmedAt: ctx.now(), resultRef: out.entityId },
        });
        await audit(tx, {
          organizationId: fctx.organizationId,
          farmId: fctx.farmId,
          actorUserId: fctx.userId,
          action: "ai.draft.confirm",
          entityType: "ai_draft",
          entityId: d.id,
          data: { action },
        });
        return out;
      },
    });
    return replyReceipt(reply, receipt);
  });
}
