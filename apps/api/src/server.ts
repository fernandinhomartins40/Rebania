import { createDb } from "@rebania/db";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();
const db = createDb({ url: config.databaseUrl, max: config.dbPoolMax });
const app = await buildApp({ db, config, now: () => new Date() });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "encerrando");
  await app.close();
  await db.$disconnect();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ port: config.port, host: config.host });
