import { roleHas, type Permission, type Role } from "@rebania/domain";
import type { Db } from "@rebania/db";
import { forbidden, notFound } from "./errors.ts";

/** Contexto de tenant derivado SEMPRE da sessão + fazenda autorizada (nunca do corpo). */
export interface FarmContext {
  userId: string;
  organizationId: string;
  farmId: string;
  timezone: string;
  role: Role;
}

export interface OrgContext {
  userId: string;
  organizationId: string;
  role: Role;
  membershipId: string;
}

/**
 * Resolve acesso à fazenda. Fazenda de outra organização (ou sem vínculo) responde
 * 404 para não revelar existência; vínculo sem permissão responde 403.
 */
export async function requireFarm(
  db: Db,
  userId: string,
  farmId: string,
  permission: Permission,
): Promise<FarmContext> {
  const farm = await db.farm.findFirst({
    where: { id: farmId, archivedAt: null },
    select: { id: true, organizationId: true, timezone: true },
  });
  if (!farm) throw notFound("Fazenda");
  const membership = await db.membership.findFirst({
    where: {
      userId,
      organizationId: farm.organizationId,
      revokedAt: null,
      OR: [{ allFarms: true }, { farms: { some: { farmId } } }],
    },
    select: { role: true },
  });
  if (!membership) throw notFound("Fazenda");
  if (!roleHas(membership.role, permission)) throw forbidden();
  return {
    userId,
    organizationId: farm.organizationId,
    farmId: farm.id,
    timezone: farm.timezone,
    role: membership.role,
  };
}

export async function requireOrg(
  db: Db,
  userId: string,
  organizationId: string,
  permission: Permission,
): Promise<OrgContext> {
  const membership = await db.membership.findFirst({
    where: { userId, organizationId, revokedAt: null },
    select: { id: true, role: true },
  });
  if (!membership) throw notFound("Organização");
  if (!roleHas(membership.role, permission)) throw forbidden();
  return { userId, organizationId, role: membership.role, membershipId: membership.id };
}

/** Lista de fazendas acessíveis por um usuário (para /me e /farms). */
export async function accessibleFarms(db: Db, userId: string) {
  const memberships = await db.membership.findMany({
    where: { userId, revokedAt: null },
    include: {
      organization: {
        include: { farms: { where: { archivedAt: null }, orderBy: { name: "asc" } } },
      },
      farms: { select: { farmId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => {
    const allowed = new Set(m.farms.map((f) => f.farmId));
    return {
      membership: m,
      farms: m.organization.farms.filter((f) => m.allFarms || allowed.has(f.id)),
    };
  });
}
