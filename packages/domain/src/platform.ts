import { DomainError } from "./errors.ts";

/**
 * Conta da equipe da plataforma (console/superadmin) e conta de cliente são excludentes:
 * quem opera o console nunca tem vínculo com organização ou fazenda de cliente. Dados de
 * um cliente só aparecem por concessão de suporte do proprietário (temporária e auditada).
 * Validar o estado resultante de cada mudança: conceder o console, aceitar convite,
 * convidar ou implantar organização com dono.
 */
export function assertPlatformAccountSeparation(account: {
  platformAdmin: boolean;
  activeMemberships: number;
}): void {
  if (account.platformAdmin && account.activeMemberships > 0) {
    throw new DomainError(
      "platform_account_separation",
      "Contas da equipe Rebania (console da plataforma) não podem ter vínculo com organização ou fazenda de cliente.",
    );
  }
}

// ---- Papéis da equipe da plataforma ------------------------------------------------

export const PLATFORM_ROLES = ["admin", "finance", "support", "onboarding"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = {
  admin: "Administrador",
  finance: "Financeiro",
  support: "Suporte",
  onboarding: "Implantação",
};

export const PLATFORM_PERMISSIONS = [
  /** Painel, lista e ficha dos clientes (sem dados do rebanho). */
  "customers.read",
  /** Criar implantação, editar cadastro, estágio, contatos. */
  "customers.write",
  /** Notas internas sobre o cliente. */
  "notes.write",
  /** Checklist de implantação e modelos. */
  "onboarding.manage",
  /** Planos, contratos e aditivos. */
  "contracts.manage",
  /** Faturas, baixas, régua e instruções de pagamento. */
  "billing.manage",
  /** Créditos de IA: concessão, estorno, tabela e pacotes. */
  "credits.manage",
  /** Usuários dos clientes: sessões, redefinição de senha, desativação. */
  "customer_users.manage",
  /** Chamados e pedidos de acesso de suporte. */
  "support.manage",
  /** Comunicados aos clientes. */
  "announcements.manage",
  /** Saúde do sistema e alertas operacionais. */
  "ops.read",
  /** Registro de auditoria da plataforma. */
  "audit.read",
  /** Equipe da plataforma: convidar, mudar papel, retirar acesso. */
  "team.manage",
  /** Configurações: e-mail transacional, segredos, modelos. */
  "settings.manage",
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

const BASE: readonly PlatformPermission[] = ["customers.read", "notes.write", "ops.read"];

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, readonly PlatformPermission[]> = {
  admin: PLATFORM_PERMISSIONS,
  finance: [...BASE, "contracts.manage", "billing.manage", "credits.manage", "audit.read"],
  support: [
    ...BASE,
    "support.manage",
    "customer_users.manage",
    "announcements.manage",
    "audit.read",
  ],
  onboarding: [...BASE, "customers.write", "onboarding.manage", "support.manage"],
};

export function platformRoleHas(role: PlatformRole, permission: PlatformPermission): boolean {
  return PLATFORM_ROLE_PERMISSIONS[role].includes(permission);
}

/** A equipe nunca fica sem um administrador ativo. */
export function assertKeepsAnAdmin(adminsAfterChange: number): void {
  if (adminsAfterChange < 1) {
    throw new DomainError(
      "last_platform_admin",
      "A equipe precisa de ao menos um administrador. Promova outra pessoa antes.",
    );
  }
}

// ---- Ciclo de vida do cliente ---------------------------------------------------------

export const ORG_STAGES = ["lead", "onboarding", "active", "suspended", "churned"] as const;
export type OrgStage = (typeof ORG_STAGES)[number];

export const ORG_STAGE_LABEL: Record<OrgStage, string> = {
  lead: "Negociação",
  onboarding: "Em implantação",
  active: "Ativo",
  suspended: "Suspenso",
  churned: "Encerrado",
};

/** Transições permitidas; voltar de "encerrado" exige reativação explícita (para "ativo"). */
const STAGE_TRANSITIONS: Record<OrgStage, readonly OrgStage[]> = {
  lead: ["onboarding", "churned"],
  onboarding: ["active", "suspended", "churned"],
  active: ["suspended", "churned"],
  suspended: ["active", "churned"],
  churned: ["active"],
};

export function assertStageTransition(from: OrgStage, to: OrgStage): void {
  if (from === to || !STAGE_TRANSITIONS[from].includes(to)) {
    throw new DomainError(
      "invalid_stage_transition",
      `Não é possível passar de "${ORG_STAGE_LABEL[from]}" para "${ORG_STAGE_LABEL[to]}".`,
    );
  }
}

// ---- Capacidade contratada (limites são contratuais, nunca cobrança por cabeça) ----------

export const CAPACITY_KEYS = ["farms", "activeAnimals", "users", "mediaGb"] as const;
export type CapacityKey = (typeof CAPACITY_KEYS)[number];
export type CapacityLimits = Partial<Record<CapacityKey, number>>;

export const CAPACITY_LABEL: Record<CapacityKey, string> = {
  farms: "Fazendas",
  activeAnimals: "Animais ativos",
  users: "Usuários",
  mediaGb: "Fotos e anexos (GB)",
};

export interface CapacityLine {
  key: CapacityKey;
  limit: number | null;
  used: number;
  /** Uso / limite (0–∞); null sem limite contratado. */
  ratio: number | null;
  status: "ok" | "near" | "over" | "unlimited";
}

/** Compara uso × capacidade. "near" a partir de 90%. Nada é bloqueado nem cobrado aqui. */
export function capacityReport(
  limits: CapacityLimits | null | undefined,
  usage: Record<CapacityKey, number>,
): CapacityLine[] {
  return CAPACITY_KEYS.map((key) => {
    const limit = limits?.[key] ?? null;
    const used = usage[key];
    if (limit === null || limit <= 0) {
      return { key, limit: null, used, ratio: null, status: "unlimited" as const };
    }
    const ratio = used / limit;
    return {
      key,
      limit,
      used,
      ratio,
      status: ratio > 1 ? ("over" as const) : ratio >= 0.9 ? ("near" as const) : ("ok" as const),
    };
  });
}

export function parseCapacityLimits(value: unknown): CapacityLimits {
  const out: CapacityLimits = {};
  if (!value || typeof value !== "object") return out;
  for (const key of CAPACITY_KEYS) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[key] = Math.floor(v);
  }
  return out;
}
