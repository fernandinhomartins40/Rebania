import {
  ImportCommitRequest,
  ImportPreviewRequest,
  type ImportRowStatus,
  type SyncReceipt,
} from "@rebania/contracts";
import {
  normalizeIdentifier,
  parseHerdRow,
  todayInTimezone,
  type ParsedRow,
} from "@rebania/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { audit } from "../lib/audit.ts";
import { recordChange } from "../lib/changes.ts";
import type { AppContext } from "../lib/context.ts";
import { stableHash } from "../lib/crypto.ts";
import { runIdempotent } from "../lib/idempotency.ts";
import { requireFarm, type FarmContext } from "../lib/tenant.ts";
import { requireAuth } from "../plugins/auth.ts";
import { createAnimal, recordWeight } from "./animals/service.ts";

type FarmParams = { Params: { farmId: string } };

/**
 * Importação (T15): a prévia NÃO grava nada; a confirmação grava cada linha de
 * forma idempotente (mutationId por linha). Rejeitadas podem ser corrigidas e
 * reenviadas sem repetir as aceitas.
 */
export function importRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const farm = (req: FastifyRequest<FarmParams>) =>
    requireFarm(db, requireAuth(req).userId, req.params.farmId, "animals.write");

  async function validate(
    fctx: FarmContext,
    rows: { line: number; raw: Record<string, string | undefined> }[],
  ) {
    const today = todayInTimezone(fctx.timezone, ctx.now());
    const parsed = rows.map((r) => ({ line: r.line, result: parseHerdRow(r.raw, today) }));
    const tags = new Map<string, number[]>();
    const rfids = new Map<string, number[]>();
    for (const p of parsed) {
      if (!p.result.ok) continue;
      tags.set(p.result.value.tag, [...(tags.get(p.result.value.tag) ?? []), p.line]);
      if (p.result.value.rfid)
        rfids.set(p.result.value.rfid, [...(rfids.get(p.result.value.rfid) ?? []), p.line]);
    }
    const [tagClash, rfidClash, groups] = await Promise.all([
      db.animalIdentifier.findMany({
        where: {
          farmId: fctx.farmId,
          type: "visual_tag",
          status: "active",
          normalizedValue: { in: [...tags.keys()] },
        },
        select: { normalizedValue: true },
      }),
      db.animalIdentifier.findMany({
        where: {
          organizationId: fctx.organizationId,
          type: "rfid",
          status: "active",
          normalizedValue: { in: [...rfids.keys()] },
        },
        select: { normalizedValue: true },
      }),
      db.group.findMany({
        where: { farmId: fctx.farmId, archivedAt: null },
        select: { id: true, name: true },
      }),
    ]);
    const tagTaken = new Set(tagClash.map((t) => t.normalizedValue));
    const rfidTaken = new Set(rfidClash.map((t) => t.normalizedValue));
    const groupByName = new Map(groups.map((g) => [g.name.toLowerCase(), g]));
    const newGroups = new Set<string>();

    const out: (ImportRowStatus & { value?: ParsedRow })[] = parsed.map((p) => {
      if (!p.result.ok)
        return {
          line: p.line,
          status: "invalid",
          errors: p.result.errors,
          tag: null,
          newGroup: null,
        };
      const v = p.result.value;
      const errors: string[] = [];
      if ((tags.get(v.tag)?.length ?? 0) > 1)
        errors.push(`Brinco ${v.tag} repetido nas linhas ${tags.get(v.tag)!.join(", ")}.`);
      if (tagTaken.has(v.tag)) errors.push(`Brinco ${v.tag} já está em uso nesta fazenda.`);
      if (v.rfid && (rfids.get(v.rfid)?.length ?? 0) > 1)
        errors.push(`RFID repetido nas linhas ${rfids.get(v.rfid)!.join(", ")}.`);
      if (v.rfid && rfidTaken.has(v.rfid)) errors.push("RFID já está em uso.");
      const isNew = v.groupName && !groupByName.has(v.groupName.toLowerCase()) ? v.groupName : null;
      if (isNew && !errors.length) newGroups.add(isNew);
      return errors.length
        ? { line: p.line, status: "invalid", errors, tag: v.tag, newGroup: null }
        : { line: p.line, status: "valid", errors: [], tag: v.tag, newGroup: isNew, value: v };
    });
    return { rows: out, newGroups: [...newGroups], groupByName };
  }

  app.post<FarmParams>("/v1/farms/:farmId/imports/preview", async (req) => {
    const fctx = await farm(req);
    const body = ImportPreviewRequest.parse(req.body);
    const v = await validate(fctx, body.rows);
    return {
      rows: v.rows.map(({ value: _value, ...r }) => r),
      valid: v.rows.filter((r) => r.status === "valid").length,
      invalid: v.rows.filter((r) => r.status === "invalid").length,
      newGroups: v.newGroups,
    };
  });

  app.post<FarmParams>(
    "/v1/farms/:farmId/imports/commit",
    { bodyLimit: 4 * 1024 * 1024 },
    async (req) => {
      const fctx = await farm(req);
      const body = ImportCommitRequest.parse(req.body);
      // Linhas já gravadas numa tentativa anterior: devolve o recibo sem revalidar
      // (o brinco delas agora "já existe" e não pode ser contado como conflito).
      const prior = await db.syncMutation.findMany({
        where: {
          mutationId: { in: body.rows.map((r) => r.mutationId) },
          farmId: fctx.farmId,
          actorUserId: fctx.userId,
        },
      });
      const done = new Map(prior.map((p) => [p.mutationId, p.receipt as unknown as SyncReceipt]));
      const pending = body.rows.filter((r) => !done.has(r.mutationId));
      const v = await validate(fctx, pending);
      const byLine = new Map(v.rows.map((r) => [r.line, r]));

      // Cria lotes novos uma única vez.
      const groupIds = new Map([...v.groupByName.entries()].map(([k, g]) => [k, g.id]));
      for (const name of v.newGroups) {
        const g = await db.$transaction(async (tx) => {
          const row = await tx.group.create({
            data: { organizationId: fctx.organizationId, farmId: fctx.farmId, name },
          });
          await recordChange(tx, fctx, "group", row.id);
          return row;
        });
        groupIds.set(name.toLowerCase(), g.id);
      }

      const results: { line: number; receipt: SyncReceipt; errors: string[] }[] = [];
      for (const r of body.rows) {
        const prev = done.get(r.mutationId);
        if (prev) {
          results.push({ line: r.line, receipt: prev, errors: [] });
          continue;
        }
        const st = byLine.get(r.line)!;
        if (st.status === "invalid" || !st.value) {
          results.push({
            line: r.line,
            receipt: {
              mutationId: r.mutationId,
              status: "rejected",
              code: "invalid_row",
              message: st.errors.join(" "),
            },
            errors: st.errors,
          });
          continue;
        }
        const val = st.value;
        const receipt = await runIdempotent({
          db,
          fctx,
          mutationId: r.mutationId,
          type: "import.row",
          requestHash: stableHash({ type: "import.row", raw: r.raw }),
          execute: async (tx) => {
            const meta = { now: ctx.now(), mutationId: r.mutationId };
            const created = await createAnimal(
              tx,
              fctx,
              {
                sex: val.sex,
                category: val.category,
                origin: val.origin,
                birthDateEstimated: false,
                identifiers: [
                  { type: "visual_tag", value: val.tag },
                  ...(val.rfid
                    ? [{ type: "rfid" as const, value: normalizeIdentifier("rfid", val.rfid) }]
                    : []),
                ],
                ...(val.breed ? { breed: val.breed } : {}),
                ...(val.birthDate ? { birthDate: val.birthDate } : {}),
                ...(val.entryDate ? { entryDate: val.entryDate } : {}),
                ...(val.groupName
                  ? { groupId: groupIds.get(val.groupName.toLowerCase()) ?? null }
                  : {}),
                ...(val.notes ? { notes: val.notes } : {}),
              },
              meta,
            );
            if (val.weightKg !== null && val.weighedOn) {
              await recordWeight(
                tx,
                fctx,
                created.entityId,
                { weightKg: val.weightKg, measuredOn: val.weighedOn, source: "import" },
                { ...meta, mutationId: undefined },
              );
            }
            return created;
          },
        });
        results.push({
          line: r.line,
          receipt,
          errors:
            receipt.status === "accepted"
              ? []
              : ["message" in receipt ? receipt.message : "Rejeitada."],
        });
      }
      const accepted = results.filter((x) => x.receipt.status === "accepted").length;
      await db.$transaction(async (tx) => {
        const batch = await tx.importBatch.create({
          data: {
            organizationId: fctx.organizationId,
            farmId: fctx.farmId,
            fileName: body.fileName,
            totalRows: body.rows.length,
            acceptedRows: accepted,
            rejectedRows: body.rows.length - accepted,
            createdById: fctx.userId,
          },
        });
        await audit(tx, {
          organizationId: fctx.organizationId,
          farmId: fctx.farmId,
          actorUserId: fctx.userId,
          action: "import.committed",
          entityType: "import_batch",
          entityId: batch.id,
          data: { accepted, rejected: body.rows.length - accepted, fileName: body.fileName },
          ip: req.ip,
        });
      });
      return { accepted, rejected: body.rows.length - accepted, results };
    },
  );
}
