import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import type { AppContext } from "./lib/context.ts";
import { errorHandler } from "./lib/errors.ts";
import { animalRoutes } from "./modules/animals/routes.ts";
import { authRoutes } from "./modules/auth.ts";
import { farmRoutes } from "./modules/farms.ts";
import { importRoutes } from "./modules/imports.ts";
import { mediaRoutes } from "./modules/media.ts";
import { reproRoutes } from "./modules/repro/routes.ts";
import { healthRoutes } from "./modules/health/routes.ts";
import { orgRoutes } from "./modules/org.ts";
import { syncRoutes } from "./modules/sync.ts";
import { CSRF_HEADER, registerAuth } from "./plugins/auth.ts";

export async function buildApp(ctx: AppContext) {
  const app = Fastify({
    logger: {
      level: ctx.config.logLevel,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          'res.headers["set-cookie"]',
          "*.password",
          "*.refreshToken",
          "*.token",
        ],
        censor: "[oculto]",
      },
    },
    trustProxy: ctx.config.trustProxy,
    bodyLimit: 256 * 1024,
  });

  app.setErrorHandler(errorHandler);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: ctx.config.webOrigins,
    credentials: true,
    allowedHeaders: ["content-type", "authorization", "idempotency-key", CSRF_HEADER],
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 600, timeWindow: "1 minute" });
  registerAuth(app, ctx);

  app.get("/v1/health", async () => {
    await ctx.db.$queryRaw`SELECT 1`;
    return { status: "ok" };
  });

  authRoutes(app, ctx);
  orgRoutes(app, ctx);
  farmRoutes(app, ctx);
  animalRoutes(app, ctx);
  syncRoutes(app, ctx);
  mediaRoutes(app, ctx);
  importRoutes(app, ctx);
  reproRoutes(app, ctx);
  healthRoutes(app, ctx);

  return app;
}
