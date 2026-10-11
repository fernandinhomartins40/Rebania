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
