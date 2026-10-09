import type { Prisma, Tx } from "@rebania/db";

export interface AuditInput {
  organizationId?: string | null;
  farmId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  data?: Prisma.InputJsonValue;
  ip?: string | null;
}

export async function audit(tx: Tx, input: AuditInput) {
  await tx.auditEntry.create({
    data: {
      organizationId: input.organizationId ?? null,
      farmId: input.farmId ?? null,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      data: input.data ?? {},
      ip: input.ip ?? null,
    },
  });
}
