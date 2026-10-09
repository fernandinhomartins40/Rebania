/**
 * Concede ou revoga acesso ao console da plataforma (equipe Rebania).
 * Uso: pnpm --filter @rebania/api platform-admin --email pessoa@rebania.com.br [--revoke]
 * Só pelo operador no servidor; não existe rota que conceda este papel.
 */
import { parseArgs } from "node:util";
import { createDb } from "@rebania/db";
import { loadConfig } from "../config.ts";

const { values } = parseArgs({
  options: { email: { type: "string" }, revoke: { type: "boolean", default: false } },
});
if (!values.email) {
  console.error("Uso: platform-admin --email pessoa@exemplo.com [--revoke]");
  process.exit(1);
}
const config = loadConfig();
const db = createDb({ url: config.databaseUrl, max: 2 });
const user = await db.user.findUnique({ where: { email: values.email.trim().toLowerCase() } });
if (!user) {
  console.error("Usuário não encontrado. A pessoa precisa ter conta (aceitar um convite) antes.");
  process.exit(1);
}
if (values.revoke) {
  await db.platformAdmin.deleteMany({ where: { userId: user.id } });
  console.log(`Acesso à plataforma revogado: ${user.email}`);
} else {
  await db.platformAdmin.upsert({
    where: { userId: user.id },
    create: { userId: user.id, note: "CLI" },
    update: {},
  });
  console.log(`Acesso à plataforma concedido: ${user.email}`);
}
await db.auditEntry.create({
  data: {
    action: values.revoke ? "platform_admin.revoke" : "platform_admin.grant",
    entityType: "user",
    entityId: user.id,
    data: { via: "cli" },
  },
});
await db.$disconnect();
