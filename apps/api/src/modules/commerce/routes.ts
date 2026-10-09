import {
  AnimalExitInput,
  CancelEntryInput,
  FeedingInput,
  FinancialEntryInput,
  PayEntryInput,
  PurchaseInput,
  ReportKindEnum,
  ReportQuery,
  SaleCheckInput,
  SaleInput,
  type FeedingDto,
} from "@rebania/contracts";
import { toCsv, type Feature, type Permission } from "@rebania/domain";
import type { Tx } from "@rebania/db";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../lib/context.ts";
import { stableHash } from "../../lib/crypto.ts";
import { dateToCivil } from "../../lib/dates.ts";
import { HttpError } from "../../lib/errors.ts";
import { runIdempotent } from "../../lib/idempotency.ts";
import { idempotencyKey, replyReceipt } from "../../lib/ops.ts";
import { requireFarm, type FarmContext } from "../../lib/tenant.ts";
import { requireAuth } from "../../plugins/auth.ts";
import { buildReport } from "./reports.ts";
import { farmFeatures } from "../depth.ts";
import {
  cancelEntry,
  checkSale,
  commercialDtos,
  entryDto,
  payEntry,
  recordEntry,
  recordExit,
  recordFeeding,
  recordPurchase,
  recordSale,
  voidFeeding,
  voidTransaction,
} from "./service.ts";

type FarmParams = { Params: { farmId: string } };
type IdParams = { Params: { farmId: string; id: string } };

export function commerceRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const farm = (req: FastifyRequest, perm: Permission) =>
    requireFarm(db, requireAuth(req).userId, (req.params as { farmId: string }).farmId, perm);
  const meta = (mutationId?: string) => ({ now: ctx.now(), ...(mutationId ? { mutationId } : {}) });
  const idem = (
    req: FastifyRequest,
    fctx: FarmContext,
    type: string,
    body: unknown,
    exec: (
      tx: Tx,
      m: string,
    ) => Promise<{ entityId: string; version: number | null; detail?: unknown }>,
  ) => {
    const mutationId = idempotencyKey(req);
    return runIdempotent({
      db,
      fctx,
      mutationId,
      type,
      requestHash: stableHash({ type, body }),
      execute: (tx) => exec(tx, mutationId),
    });
  };

  // ---- Compra e venda (T35) ----
  app.post<FarmParams>("/v1/farms/:farmId/sales/check", async (req) => {
    const fctx = await farm(req, "sales.manage");
    const body = SaleCheckInput.parse(req.body);
    return checkSale(db, fctx, body.animalIds, body.date);
  });

  app.post<FarmParams>("/v1/farms/:farmId/sales", async (req, reply) => {
    const fctx = await farm(req, "sales.manage");
    const input = SaleInput.parse(req.body);
    const receipt = await idem(req, fctx, "sale.record", input, (tx, m) =>
      recordSale(tx, fctx, { ...input, id: input.id ?? m }, meta(m)),
    );
    return replyReceipt(reply, receipt);
  });

  app.post<FarmParams>("/v1/farms/:farmId/purchases", async (req, reply) => {
    const fctx = await farm(req, "sales.manage");
    const input = PurchaseInput.parse(req.body);
    const receipt = await idem(req, fctx, "purchase.record", input, (tx, m) =>
      recordPurchase(tx, fctx, { ...input, id: input.id ?? m }, meta(m)),
    );
    return replyReceipt(reply, receipt);
  });

  app.get<FarmParams>("/v1/farms/:farmId/commercial", async (req) => {
    const fctx = await farm(req, "finance.read");
    const q = z.object({ kind: z.enum(["sale", "purchase"]).optional() }).parse(req.query);
    const rows = await db.commercialTransaction.findMany({
      where: { farmId: fctx.farmId, ...(q.kind ? { kind: q.kind } : {}) },
      select: { id: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    return {
      items: await commercialDtos(
        db,
        fctx,
        rows.map((r) => r.id),
      ),
    };
  });

  app.get<IdParams>("/v1/farms/:farmId/commercial/:id", async (req) => {
    const fctx = await farm(req, "finance.read");
    const [dto] = await commercialDtos(db, fctx, [req.params.id]);
    if (!dto) throw new HttpError(404, "not_found", "Transação não encontrada.");
    return dto;
  });

  app.post<IdParams>("/v1/farms/:farmId/commercial/:id/void", async (req) => {
    const fctx = await farm(req, "sales.manage");
    const body = z.object({ reason: z.string().trim().min(5).max(300) }).parse(req.body);
    await db.$transaction((tx) => voidTransaction(tx, fctx, req.params.id, body.reason, meta()));
    return { ok: true };
  });

  // ---- Saída: morte, descarte, transferência ----
  app.post<IdParams>("/v1/farms/:farmId/animals/:id/exit", async (req, reply) => {
    const fctx = await farm(req, "events.write");
    const input = AnimalExitInput.parse(req.body);
    const receipt = await idem(req, fctx, "animal.exit", { id: req.params.id, input }, (tx, m) =>
      recordExit(tx, fctx, req.params.id, input, meta(m)),
    );
    return replyReceipt(reply, receipt);
  });

  // ---- Trato (T33) ----
  app.post<FarmParams>("/v1/farms/:farmId/feedings", async (req, reply) => {
    const fctx = await farm(req, "events.write");
    const input = FeedingInput.parse(req.body);
    const receipt = await idem(req, fctx, "feeding.record", input, (tx, m) =>
      recordFeeding(tx, fctx, { ...input, id: input.id ?? m }, meta(m)),
    );
    return replyReceipt(reply, receipt);
  });

  app.get<FarmParams>("/v1/farms/:farmId/feedings", async (req) => {
    const fctx = await farm(req, "animals.read");
    const rows = await db.feedingEvent.findMany({
      where: { farmId: fctx.farmId },
      include: { group: { select: { name: true } }, product: { select: { name: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    const items: FeedingDto[] = rows.map((f) => ({
      id: f.id,
      date: dateToCivil(f.date),
      groupId: f.groupId,
      groupName: f.group?.name ?? null,
      diet: f.diet,
      productId: f.productId,
      productName: f.product?.name ?? null,
      quantity: Number(f.quantity),
      unit: f.unit,
      heads: f.heads,
      costCents: f.costCents === null ? null : Number(f.costCents),
      voided: f.voidedAt !== null,
    }));
    return { items };
  });

  app.post<IdParams>("/v1/farms/:farmId/feedings/:id/void", async (req) => {
    const fctx = await farm(req, "events.write");
    const body = z.object({ reason: z.string().trim().min(3).max(300) }).parse(req.body);
    await db.$transaction((tx) => voidFeeding(tx, fctx, req.params.id, body.reason, meta()));
    return { ok: true };
  });

  // ---- Financeiro (T38) ----
  app.get<FarmParams>("/v1/farms/:farmId/finance/entries", async (req) => {
    const fctx = await farm(req, "finance.read");
    const q = z
      .object({
        status: z.enum(["open", "paid", "cancelled"]).optional(),
        kind: z.enum(["income", "expense"]).optional(),
      })
      .parse(req.query);
    const rows = await db.financialEntry.findMany({
      where: {
        farmId: fctx.farmId,
        ...(q.status ? { status: q.status } : {}),
        ...(q.kind ? { kind: q.kind } : {}),
      },
      orderBy: [{ dueOn: q.status === "open" ? "asc" : "desc" }, { createdAt: "desc" }],
      take: 500,
    });
    return { items: rows.map(entryDto) };
  });

  app.post<FarmParams>("/v1/farms/:farmId/finance/entries", async (req, reply) => {
    const fctx = await farm(req, "finance.write");
    const input = FinancialEntryInput.parse(req.body);
    const receipt = await idem(req, fctx, "finance.entry", input, (tx, m) =>
      recordEntry(tx, fctx, input, meta(m)),
    );
    return replyReceipt(reply, receipt);
  });

  app.post<IdParams>("/v1/farms/:farmId/finance/entries/:id/pay", async (req) => {
    const fctx = await farm(req, "finance.write");
    const body = PayEntryInput.parse(req.body);
    await db.$transaction((tx) => payEntry(tx, fctx, req.params.id, body.paidOn, meta()));
    return { ok: true };
  });

  app.post<IdParams>("/v1/farms/:farmId/finance/entries/:id/cancel", async (req) => {
    const fctx = await farm(req, "finance.write");
    const body = CancelEntryInput.parse(req.body);
    await db.$transaction((tx) => cancelEntry(tx, fctx, req.params.id, body.reason));
    return { ok: true };
  });

  // ---- Relatórios (T39) ----
  app.get<{ Params: { farmId: string; kind: string } }>(
    "/v1/farms/:farmId/reports/:kind",
    async (req, reply) => {
      const kind = ReportKindEnum.parse(req.params.kind);
      const fctx = await farm(
        req,
        kind === "financial" || kind === "commercial" || kind === "result" || kind === "slaughter"
          ? "finance.read"
          : "reports.read",
      );
      const needs: Partial<Record<typeof kind, Feature>> = {
        confinement: "confinement",
        slaughter: "slaughter",
        result: "result",
        pastures: "pasture",
      };
      const feature = needs[kind];
      if (feature && !(await farmFeatures(db, fctx.farmId))[feature]) {
        throw new HttpError(
          409,
          "feature_disabled",
          "Módulo desativado nesta fazenda (Configurações).",
        );
      }
      const q = ReportQuery.parse(req.query);
      if (q.from > q.to) throw new HttpError(400, "invalid_period", "Início depois do fim.");
      const r = await buildReport(db, fctx, kind, q.from, q.to);
      if (q.format === "csv") {
        const csv = toCsv(
          r.columns.map((c) => c.label),
          [
            ...r.rows.map((row) => r.columns.map((c) => row[c.key] ?? null)),
            ...(r.totals ? [r.columns.map((c) => r.totals![c.key] ?? null)] : []),
          ],
        );
        return reply
          .header("content-type", "text/csv; charset=utf-8")
          .header(
            "content-disposition",
            `attachment; filename="rebania-${kind}-${q.from}-a-${q.to}.csv"`,
          )
          .send(csv);
      }
      return r;
    },
  );
}
