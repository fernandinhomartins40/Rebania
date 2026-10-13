import type { AppContext } from "./context.ts";
import { randomToken, sha256 } from "./crypto.ts";

/** Abre uma sessão (web: cookie; mobile: access + refresh). Só os hashes ficam no banco. */
export async function openSession(
  ctx: AppContext,
  userId: string,
  channel: "web" | "mobile",
  meta: { deviceLabel?: string; userAgent?: string },
) {
  const { db, config } = ctx;
  const now = ctx.now();
  const access = randomToken();
  const refresh = channel === "mobile" ? randomToken(48) : null;
  const accessExpiresAt = new Date(
    now.getTime() + (channel === "web" ? config.webSessionTtlMs : config.mobileAccessTtlMs),
  );
  const refreshExpiresAt = refresh ? new Date(now.getTime() + config.mobileRefreshTtlMs) : null;
  const session = await db.authSession.create({
    data: {
      userId,
      channel,
      accessHash: sha256(access),
      accessExpiresAt,
      refreshHash: refresh ? sha256(refresh) : null,
      refreshExpiresAt,
      deviceLabel: meta.deviceLabel ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      lastUsedAt: now,
    },
  });
  return { session, access, refresh, accessExpiresAt, refreshExpiresAt };
}

export const sessionUser = (u: {
  id: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
}) => ({ id: u.id, name: u.name, email: u.email, mustChangePassword: u.mustChangePassword });
