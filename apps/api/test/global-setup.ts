import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

/** Recria o banco de teste e aplica as migrations reais. */
export default async function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgresql://rebania:rebania@localhost:5432/rebania_test";
  const target = new URL(url);
  const dbName = target.pathname.slice(1);
  if (!/_test$/.test(dbName))
    throw new Error(`Banco de teste precisa terminar em _test (recebido: ${dbName})`);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();
  const dbPkg = fileURLToPath(new URL("../../../packages/db", import.meta.url));
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: dbPkg,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  process.env.TEST_DATABASE_URL = url;
}
