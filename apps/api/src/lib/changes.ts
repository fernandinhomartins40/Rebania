import type { Tx } from "@rebania/db";
import type { FarmContext } from "./tenant.ts";

export type ChangeEntity = "animal" | "group" | "pasture" | "weight";

/** Registra mudança no feed de sync (mesma transação da escrita). */
export async function recordChange(
  tx: Tx,
  fctx: Pick<FarmContext, "organizationId" | "farmId">,
  entity: ChangeEntity,
  entityId: string,
  op: "upsert" | "delete" = "upsert",
) {
  await tx.changeLog.create({
    data: { organizationId: fctx.organizationId, farmId: fctx.farmId, entity, entityId, op },
  });
}
