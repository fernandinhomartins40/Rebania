import { platformRoleHas, type PlatformPermission, type PlatformRole } from "@rebania/domain";
import type { FastifyRequest } from "fastify";
import { requireAuth } from "../plugins/auth.ts";
import type { AppContext } from "./context.ts";
import { forbidden, HttpError, notFound } from "./errors.ts";

export interface StaffContext {
  userId: string;
  sessionId: string;
  role: PlatformRole;
}

/**
 * Acesso ao console: conta da equipe (404 para quem não é, sem revelar o console),
 * permissão do papel e, com o cofre configurado, verificação em duas etapas nesta sessão.
 */
export async function requireStaff(
  ctx: AppContext,
  req: FastifyRequest,
  permission: PlatformPermission | null,
  opts: { skipMfa?: boolean } = {},
): Promise<StaffContext> {
  const { userId, sessionId } = requireAuth(req);
  const admin = await ctx.db.platformAdmin.findUnique({ where: { userId } });
  if (!admin) throw notFound("Recurso");
  if (!opts.skipMfa && ctx.secrets?.available) {
    if (!admin.mfaEnabledAt)
      throw new HttpError(
        403,
        "mfa_enrollment_required",
        "Ative a verificação em duas etapas para usar o console.",
      );
    const session = await ctx.db.authSession.findUnique({
      where: { id: sessionId },
      select: { mfaVerifiedAt: true },
    });
    if (!session?.mfaVerifiedAt)
      throw new HttpError(403, "mfa_required", "Confirme o código de verificação para continuar.");
  }
  if (permission && !platformRoleHas(admin.role, permission)) throw forbidden();
  return { userId, sessionId, role: admin.role };
}
