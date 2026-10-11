import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../lib/context.ts";
import { auditLogRoutes } from "./audit-log.ts";
import { billingRoutes } from "./billing.ts";
import { contractRoutes } from "./contracts.ts";
import { creditRoutes } from "./credits.ts";
import { customerUserRoutes } from "./customer-users.ts";
import { customerRoutes } from "./customers.ts";
import { dashboardRoutes } from "./dashboard.ts";
import { onboardingRoutes } from "./onboarding.ts";
import { opsRoutes } from "./ops.ts";
import { settingsRoutes } from "./settings.ts";
import { supportRoutes } from "./support.ts";
import { teamRoutes } from "./team.ts";

/**
 * Console da plataforma (equipe Rebania) — área separada do app do cliente (T07).
 * Acesso só para `platform_admins`, por papel, com verificação em duas etapas. Dados
 * operacionais da fazenda só com concessão de suporte do proprietário, sempre auditada.
 */
export function platformRoutes(app: FastifyInstance, ctx: AppContext) {
  teamRoutes(app, ctx);
  dashboardRoutes(app, ctx);
  customerRoutes(app, ctx);
  onboardingRoutes(app, ctx);
  contractRoutes(app, ctx);
  billingRoutes(app, ctx);
  creditRoutes(app, ctx);
  customerUserRoutes(app, ctx);
  supportRoutes(app, ctx);
  opsRoutes(app, ctx);
  auditLogRoutes(app, ctx);
  settingsRoutes(app, ctx);
}
