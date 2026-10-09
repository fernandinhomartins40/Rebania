import { randomUUID } from "node:crypto";
import type { SyncReceipt } from "@rebania/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { HttpError } from "./errors.ts";

/** Idempotency-Key do cliente (UUID) ou um novo id quando ausente. */
export function idempotencyKey(req: FastifyRequest): string {
  const h = req.headers["idempotency-key"];
  if (h === undefined) return randomUUID();
  const p = z.uuid().safeParse(h);
  if (!p.success)
    throw new HttpError(400, "invalid_idempotency_key", "Idempotency-Key deve ser um UUID.");
  return p.data;
}

/** Converte o recibo idempotente em resposta HTTP. */
export function replyReceipt(reply: FastifyReply, receipt: SyncReceipt) {
  if (receipt.status === "accepted")
    return reply.status(201).send(receipt.detail ?? { id: receipt.entityId });
  if (receipt.status === "conflict") {
    return reply.status(409).send({ error: { code: receipt.code, message: receipt.message } });
  }
  return reply
    .status(receipt.code === "not_found" ? 404 : 422)
    .send({ error: { code: receipt.code, message: receipt.message } });
}
