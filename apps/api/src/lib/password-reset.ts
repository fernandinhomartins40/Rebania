import type { AppContext } from "./context.ts";
import { randomToken, sha256 } from "./crypto.ts";

export const PASSWORD_RESET_TTL_MS = 3600_000;

/**
 * Link de definição/redefinição de senha: token aleatório no fragmento da URL (não vai a
 * logs), só o hash no banco, uso único, 1 hora.
 */
export async function issuePasswordLink(
  ctx: AppContext,
  userId: string,
  requestedById: string | null,
): Promise<string> {
  const token = randomToken();
  await ctx.db.passwordResetToken.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(ctx.now().getTime() + PASSWORD_RESET_TTL_MS),
      requestedById,
    },
  });
  return `${ctx.config.webBaseUrl}/redefinir-senha#token=${token}`;
}
