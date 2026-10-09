import type { SyncReceipt } from "@rebania/contracts";
import { DomainError } from "@rebania/domain";
import type { Db, Prisma, Tx } from "@rebania/db";
import { VersionConflictError } from "./conflict.ts";
import { HttpError, isUniqueViolation } from "./errors.ts";
import type { FarmContext } from "./tenant.ts";

export interface IdempotentInput {
  db: Db;
  fctx: FarmContext;
  mutationId: string;
  type: string;
  requestHash: string;
  deviceId?: string | null;
  execute: (tx: Tx) => Promise<{ entityId: string; version: number | null; detail?: unknown }>;
}

/**
 * Executa uma mutação exatamente uma vez por `mutationId`.
 * - Repetição com o mesmo conteúdo devolve o MESMO recibo, sem reexecutar.
 * - Reuso do id com conteúdo diferente é rejeitado.
 * - Rejeições de regra e conflitos também geram recibo estável.
 * - Erros inesperados não geram recibo (o cliente pode tentar de novo).
 */
export async function runIdempotent(input: IdempotentInput): Promise<SyncReceipt> {
  const { db, mutationId } = input;
  const prior = await readPrior(input);
  if (prior) return prior;

  try {
    return await db.$transaction(async (tx) => {
      const result = await input.execute(tx);
      const receipt: SyncReceipt = {
        mutationId,
        status: "accepted",
        entityId: result.entityId,
        version: result.version,
        ...(result.detail !== undefined ? { detail: result.detail } : {}),
      };
      await saveReceipt(tx, input, receipt, result.entityId);
      return receipt;
    });
  } catch (err) {
    let receipt: SyncReceipt;
    if (err instanceof VersionConflictError) {
      receipt = {
        mutationId,
        status: "conflict",
        entityId: err.entityId,
        serverVersion: err.serverVersion,
        code: err.code,
        message: err.message,
      };
    } else if (err instanceof DomainError || (err instanceof HttpError && err.status < 500)) {
      receipt = { mutationId, status: "rejected", code: err.code, message: err.message };
    } else if (isUniqueViolation(err)) {
      // Pode ser corrida no próprio mutationId ou violação de unicidade de negócio.
      const raced = await readPrior(input);
      if (raced) return raced;
      receipt = {
        mutationId,
        status: "rejected",
        code: "duplicate",
        message: "Já existe um registro ativo com esses dados (ex.: identificador em uso).",
      };
    } else {
      throw err;
    }
    try {
      await saveReceipt(db, input, receipt, "entityId" in receipt ? receipt.entityId : null);
    } catch (saveErr) {
      if (!isUniqueViolation(saveErr)) throw saveErr;
      const raced = await readPrior(input);
      if (raced) return raced;
    }
    return receipt;
  }
}

async function readPrior(input: IdempotentInput): Promise<SyncReceipt | null> {
  const existing = await input.db.syncMutation.findUnique({
    where: { mutationId: input.mutationId },
  });
  if (!existing) return null;
  if (
    existing.organizationId !== input.fctx.organizationId ||
    existing.farmId !== input.fctx.farmId ||
    existing.actorUserId !== input.fctx.userId ||
    existing.type !== input.type ||
    existing.requestHash !== input.requestHash
  ) {
    return {
      mutationId: input.mutationId,
      status: "rejected",
      code: "mutation_id_reused",
      message: "Identificador de operação já utilizado com outro conteúdo.",
    };
  }
  return existing.receipt as unknown as SyncReceipt;
}

async function saveReceipt(
  client: Tx | Db,
  input: IdempotentInput,
  receipt: SyncReceipt,
  entityId: string | null,
) {
  await client.syncMutation.create({
    data: {
      mutationId: input.mutationId,
      organizationId: input.fctx.organizationId,
      farmId: input.fctx.farmId,
      deviceId: input.deviceId ?? null,
      actorUserId: input.fctx.userId,
      type: input.type,
      entityId,
      requestHash: input.requestHash,
      receipt: receipt as unknown as Prisma.InputJsonValue,
    },
  });
}
