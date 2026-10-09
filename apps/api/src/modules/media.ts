import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { CreateMediaInput, type Media } from "@rebania/contracts";
import { enqueueJob } from "@rebania/db";
import {
  appendChunk,
  finalizeUpload,
  MAX_CHUNK_BYTES,
  OffsetMismatchError,
  removeMedia,
  variantPath,
  type Variant,
} from "@rebania/media";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { audit } from "../lib/audit.ts";
import { recordChange } from "../lib/changes.ts";
import type { AppContext } from "../lib/context.ts";
import { civilToDate, dateToCivil } from "../lib/dates.ts";
import { HttpError, notFound } from "../lib/errors.ts";
import { requireFarm } from "../lib/tenant.ts";
import { requireAuth } from "../plugins/auth.ts";
import { mediaUrl } from "./animals/service.ts";

type FarmParams = { Params: { farmId: string } };
type MediaParams = { Params: { farmId: string; mediaId: string } };
const VariantParam = z.enum(["thumb", "display", "original"]);

/**
 * Fotos (T12): upload retomável por offset (protocolo simples, inspirado no tus),
 * checksum sha256, tipo real verificado pelos bytes, derivados gerados no worker
 * e entrega SOMENTE por rota autenticada (nada de URL pública).
 */
export function mediaRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config } = ctx;
  const root = config.mediaDir;

  app.addContentTypeParser(
    "application/offset+octet-stream",
    { parseAs: "buffer", bodyLimit: MAX_CHUNK_BYTES + 1024 },
    (_req, body, done) => done(null, body),
  );

  const farm = (req: FastifyRequest<FarmParams>, perm: Parameters<typeof requireFarm>[3]) =>
    requireFarm(db, requireAuth(req).userId, req.params.farmId, perm);

  const toDto = (
    a: {
      id: string;
      farmId: string;
      animalId: string | null;
      status: Media["status"];
      sizeBytes: number;
      uploadedBytes: number;
      caption: string | null;
      takenOn: Date | null;
      width: number | null;
      height: number | null;
      createdAt: Date;
    },
    authorName: string | null = null,
  ): Media => ({
    id: a.id,
    animalId: a.animalId,
    status: a.status,
    sizeBytes: a.sizeBytes,
    uploadedBytes: a.uploadedBytes,
    caption: a.caption,
    takenOn: dateToCivil(a.takenOn),
    width: a.width,
    height: a.height,
    thumbUrl: a.status === "ready" ? mediaUrl(a.farmId, a.id, "thumb") : null,
    displayUrl: a.status === "ready" ? mediaUrl(a.farmId, a.id, "display") : null,
    createdAt: a.createdAt.toISOString(),
    authorName,
  });

  /** Cria (ou retoma) um upload. O id vem do aparelho: repetir a chamada é seguro. */
  app.post<FarmParams>("/v1/farms/:farmId/media", async (req, reply) => {
    const fctx = await farm(req, "animals.write");
    const body = CreateMediaInput.parse(req.body);
    if (body.animalId) {
      const a = await db.animal.findFirst({ where: { id: body.animalId, farmId: fctx.farmId } });
      if (!a) throw notFound("Animal");
    }
    const existing = await db.attachment.findUnique({ where: { id: body.id } });
    if (existing) {
      if (existing.farmId !== fctx.farmId || existing.sha256 !== body.sha256) {
        throw new HttpError(409, "media_id_reused", "Identificador de foto já utilizado.");
      }
      return reply.status(200).send(toDto(existing));
    }
    const created = await db.attachment.create({
      data: {
        id: body.id,
        organizationId: fctx.organizationId,
        farmId: fctx.farmId,
        animalId: body.animalId ?? null,
        mime: body.mime,
        sizeBytes: body.sizeBytes,
        sha256: body.sha256,
        caption: body.caption ?? null,
        takenOn: body.takenOn ? civilToDate(body.takenOn) : null,
        createdById: fctx.userId,
      },
    });
    return reply.status(201).send(toDto(created));
  });

  app.get<MediaParams>("/v1/farms/:farmId/media/:mediaId", async (req) => {
    const fctx = await farm(req, "animals.read");
    const a = await db.attachment.findFirst({
      where: { id: req.params.mediaId, farmId: fctx.farmId, deletedAt: null },
    });
    if (!a) throw notFound("Foto");
    return toDto(a);
  });

  /** Envia um bloco. Header `upload-offset` precisa ser igual ao já recebido. */
  app.patch<MediaParams>("/v1/farms/:farmId/media/:mediaId", async (req) => {
    const fctx = await farm(req, "animals.write");
    const chunk = req.body;
    if (!Buffer.isBuffer(chunk) || chunk.length === 0) {
      throw new HttpError(
        415,
        "chunk_required",
        "Envie o bloco como application/offset+octet-stream.",
      );
    }
    const offset = Number(req.headers["upload-offset"]);
    if (!Number.isInteger(offset) || offset < 0)
      throw new HttpError(400, "offset_required", "Header upload-offset inválido.");
    const a = await db.attachment.findFirst({
      where: { id: req.params.mediaId, farmId: fctx.farmId, deletedAt: null },
    });
    if (!a) throw notFound("Foto");
    if (a.status !== "uploading") return toDto(a);
    if (offset + chunk.length > a.sizeBytes)
      throw new HttpError(413, "chunk_too_large", "O bloco ultrapassa o tamanho declarado.");
    const key = { organizationId: a.organizationId, farmId: a.farmId, attachmentId: a.id };
    let uploaded: number;
    try {
      uploaded = await appendChunk(root, key, offset, chunk);
    } catch (err) {
      if (err instanceof OffsetMismatchError) {
        throw new HttpError(
          409,
          "offset_mismatch",
          "Retome o envio a partir do offset informado.",
          { uploadedBytes: err.actual },
        );
      }
      throw err;
    }
    if (uploaded < a.sizeBytes) {
      const updated = await db.attachment.update({
        where: { id: a.id },
        data: { uploadedBytes: uploaded },
      });
      return toDto(updated);
    }
    try {
      await finalizeUpload(root, key, a.sha256);
    } catch (err) {
      const failed = await db.attachment.update({
        where: { id: a.id },
        data: {
          status: "failed",
          uploadedBytes: 0,
          failureReason: err instanceof Error ? err.message : "falha",
        },
      });
      throw new HttpError(
        422,
        "media_invalid",
        "Arquivo inválido: confira se é uma foto e envie novamente.",
        { media: toDto(failed) },
      );
    }
    const updated = await db.$transaction(async (tx) => {
      const u = await tx.attachment.update({
        where: { id: a.id },
        data: { uploadedBytes: uploaded, status: "processing" },
      });
      await enqueueJob(
        tx,
        "media.derive",
        { attachmentId: a.id },
        { dedupeKey: `media.derive:${a.id}` },
      );
      return u;
    });
    return toDto(updated);
  });

  app.get<{ Params: { farmId: string; mediaId: string; variant: string } }>(
    "/v1/farms/:farmId/media/:mediaId/:variant",
    async (req, reply) => {
      const fctx = await farm(req, "animals.read");
      const variant = VariantParam.parse(req.params.variant) as Variant;
      const a = await db.attachment.findFirst({
        where: { id: req.params.mediaId, farmId: fctx.farmId, deletedAt: null, status: "ready" },
      });
      if (!a) throw notFound("Foto");
      const file = variantPath(
        root,
        { organizationId: a.organizationId, farmId: a.farmId, attachmentId: a.id },
        variant,
      );
      const st = await stat(file).catch(() => null);
      if (!st) throw notFound("Foto");
      return reply
        .header("content-type", variant === "original" ? "image/jpeg" : "image/webp")
        .header("content-length", st.size)
        .header("cache-control", "private, max-age=86400, immutable")
        .header("x-content-type-options", "nosniff")
        .send(createReadStream(file));
    },
  );

  app.get<{ Params: { farmId: string; animalId: string } }>(
    "/v1/farms/:farmId/animals/:animalId/media",
    async (req) => {
      const fctx = await farm(req as unknown as FastifyRequest<FarmParams>, "animals.read");
      const rows = await db.attachment.findMany({
        where: {
          animalId: req.params.animalId,
          farmId: fctx.farmId,
          deletedAt: null,
          status: { in: ["ready", "processing", "failed"] },
        },
        orderBy: [{ takenOn: "desc" }, { createdAt: "desc" }],
        take: 200,
      });
      const authors = await db.user.findMany({
        where: {
          id: { in: rows.map((r) => r.createdById).filter((x): x is string => Boolean(x)) },
        },
        select: { id: true, name: true },
      });
      const name = new Map(authors.map((u) => [u.id, u.name]));
      return rows.map((r) => toDto(r, r.createdById ? (name.get(r.createdById) ?? null) : null));
    },
  );

  app.post<MediaParams>("/v1/farms/:farmId/media/:mediaId/delete", async (req, reply) => {
    const fctx = await farm(req, "animals.write");
    const a = await db.attachment.findFirst({
      where: { id: req.params.mediaId, farmId: fctx.farmId, deletedAt: null },
    });
    if (!a) throw notFound("Foto");
    await db.$transaction(async (tx) => {
      await tx.attachment.update({ where: { id: a.id }, data: { deletedAt: ctx.now() } });
      if (a.animalId) await recordChange(tx, fctx, "animal", a.animalId);
      await audit(tx, {
        organizationId: fctx.organizationId,
        farmId: fctx.farmId,
        actorUserId: fctx.userId,
        action: "media.deleted",
        entityType: "attachment",
        entityId: a.id,
        ip: req.ip,
      });
    });
    // Arquivo removido do disco; o registro permanece para auditoria.
    await removeMedia(root, {
      organizationId: a.organizationId,
      farmId: a.farmId,
      attachmentId: a.id,
    });
    return reply.status(204).send();
  });
}
