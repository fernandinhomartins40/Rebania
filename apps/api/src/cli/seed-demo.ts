/**
 * Organização de demonstração com um usuário por perfil, para testar o produto.
 * Uso: SEED_DEMO_PASSWORD='senha-com-10+' pnpm --filter @rebania/api seed-demo [--platform-admin]
 *   ou: pnpm --filter @rebania/api seed-demo --password 'senha-com-10+'
 * Sem senha informada, gera uma aleatória e a mostra só neste terminal.
 * --platform-admin também dá ao usuário proprietário da demo acesso ao console da plataforma.
 * Idempotente: reexecutar redefine as senhas e não duplica dados. Os dados são fictícios
 * e ficam numa organização própria ("Rebania Demonstração (dados fictícios)").
 */
import { parseArgs } from "node:util";
import { createDb } from "@rebania/db";
import { loadConfig } from "../config.ts";
import { randomToken } from "../lib/crypto.ts";
import { DEMO_USERS, seedDemo } from "../lib/demo-seed.ts";

const { values } = parseArgs({
  options: {
    password: { type: "string" },
    timezone: { type: "string", default: "America/Sao_Paulo" },
    "platform-admin": { type: "boolean", default: false },
  },
});

const provided = values.password ?? process.env.SEED_DEMO_PASSWORD ?? "";
const password = provided || `Demo-${randomToken(9)}`;
if (password.length < 10) {
  console.error("A senha precisa ter ao menos 10 caracteres.");
  process.exit(1);
}

const config = loadConfig();
const db = createDb({ url: config.databaseUrl, max: 2 });
try {
  const result = await seedDemo(db, { password, timezone: values.timezone });
  if (values["platform-admin"]) {
    const owner = await db.user.findUniqueOrThrow({ where: { email: DEMO_USERS[0]!.email } });
    await db.platformAdmin.upsert({
      where: { userId: owner.id },
      create: { userId: owner.id, note: "demo seed" },
      update: {},
    });
    await db.auditEntry.create({
      data: {
        action: "platform_admin.grant",
        entityType: "user",
        entityId: owner.id,
        data: { via: "seed-demo" },
      },
    });
  }
  console.log(`Organização de demonstração: ${result.organizationId}`);
  console.log(`Fazenda: ${result.farmId} (animais criados agora: ${result.animalsCreated})`);
  console.log(`Acesso: ${config.webBaseUrl}/entrar`);
  for (const u of result.users) console.log(`  ${u.role.padEnd(13)} ${u.email}`);
  if (values["platform-admin"]) console.log(`  console da plataforma: ${DEMO_USERS[0]!.email}`);
  console.log(
    provided
      ? "Senha: a informada (mesma para todos)."
      : `Senha gerada (mesma para todos): ${password}`,
  );
} finally {
  await db.$disconnect();
}
