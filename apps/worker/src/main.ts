import { hostname } from "node:os";
import { createDb } from "@rebania/db";
import { createSecretBox } from "@rebania/saas";
import { handlers, schedules } from "./handlers.ts";
import { drain, releaseStaleJobs, scheduleRecurring } from "./runner.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definido");
const db = createDb({ url, max: Number(process.env.DB_POOL_MAX ?? 3) });
const workerId = `${hostname()}:${process.pid}`;
const pollMs = Number(process.env.WORKER_POLL_MS ?? 2000);
const mediaDir = process.env.MEDIA_DIR ?? "../../var/media";
// Mesmo cofre da API (chave do VeloMail) e URL pública para links nos e-mails.
const secrets = createSecretBox(process.env.PLATFORM_SECRETS_KEY || null);
const webBaseUrl = (process.env.WEB_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(
    JSON.stringify({ level: "info", time: new Date().toISOString(), workerId, msg, ...extra }),
  );

let stopping = false;
const stop = () => {
  stopping = true;
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

log("worker iniciado", { queues: Object.keys(handlers) });
let lastMaintenance = 0;
while (!stopping) {
  try {
    if (Date.now() - lastMaintenance > 60_000) {
      await releaseStaleJobs(db);
      await scheduleRecurring(db, schedules);
      lastMaintenance = Date.now();
    }
    const n = await drain({ db, workerId, handlers, mediaDir, log, secrets, webBaseUrl });
    if (n === 0) await new Promise((r) => setTimeout(r, pollMs));
  } catch (err) {
    log("erro no loop do worker", { error: err instanceof Error ? err.message : String(err) });
    await new Promise((r) => setTimeout(r, pollMs * 5));
  }
}
log("worker encerrado");
await db.$disconnect();
