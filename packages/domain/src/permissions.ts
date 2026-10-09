/**
 * Papéis e permissões. A verificação acontece SEMPRE no servidor; o cliente usa
 * a mesma tabela apenas para esconder ações indisponíveis.
 */
export const ROLES = ["owner", "manager", "field", "veterinarian", "finance"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Proprietário",
  manager: "Gerente",
  field: "Funcionário de campo",
  veterinarian: "Veterinário / inseminador",
  finance: "Administrativo",
};

export const PERMISSIONS = [
  "org.manage",
  "members.read",
  "members.invite",
  "farms.manage",
  "animals.read",
  "animals.write",
  "animals.retag",
  "events.write",
  "groups.manage",
  "settings.manage",
  "tasks.manage",
  "finance.read",
  "finance.write",
  "reports.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: ALL,
  manager: [
    "members.read",
    "members.invite",
    "animals.read",
    "animals.write",
    "animals.retag",
    "events.write",
    "groups.manage",
    "settings.manage",
    "tasks.manage",
    "finance.read",
    "reports.read",
  ],
  field: ["animals.read", "animals.write", "events.write"],
  veterinarian: ["animals.read", "events.write", "reports.read", "tasks.manage"],
  finance: ["animals.read", "finance.read", "finance.write", "reports.read"],
};

export function roleHas(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Papéis que um convidante pode atribuir: nunca acima do próprio. */
export function canAssignRole(inviter: Role, target: Role): boolean {
  if (inviter === "owner") return true;
  if (inviter === "manager") return target !== "owner" && target !== "manager";
  return false;
}
