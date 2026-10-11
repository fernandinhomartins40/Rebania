import { roleHas, type Permission, type Role } from "@rebania/domain";
import type { Db } from "@rebania/db";
import { forbidden, HttpError, notFound } from "./errors.ts";
import { requestContext } from "./request-context.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Em somente leitura (D-13: suspensão, encerramento ou fatura vencida há mais de
 * 15 dias) o cliente consulta tudo, mas não registra nada novo — inclusive pelo sync.
 * Continuam abertos: suporte, concessão de acesso ao suporte e perguntas ao assistente.
 */
const READ_ONLY_ALLOWED = [
  /^\/v1\/orgs\/[^/]+\/support(-grants|-access-requests|\/)/,
  /^\/v1\/farms\/[^/]+\/ai\/ask$/,
];

function assertWritable(org: { accessMode: "full" | "read_only"; accessReason: string | null }) {
  if (org.accessMode !== "read_only") return;
  const rc = requestContext.getStore();
  if (!rc || SAFE_METHODS.has(rc.method)) return;
  if (READ_ONLY_ALLOWED.some((re) => re.test(rc.path))) return;
  throw new HttpError(
    403,
    "org_read_only",
    org.accessReason ?? "Conta em somente leitura: novos registros estão bloqueados.",
  );
}

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
    select: {
      id: true,
      organizationId: true,
      timezone: true,
      organization: { select: { accessMode: true, accessReason: true } },
    },
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
  assertWritable(farm.organization);
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
    select: {
      id: true,
      role: true,
      organization: { select: { accessMode: true, accessReason: true } },
    },
  });
  if (!membership) throw notFound("Organização");
  if (!roleHas(membership.role, permission)) throw forbidden();
  assertWritable(membership.organization);
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
