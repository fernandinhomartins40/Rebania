/**
 * Organização de demonstração com um usuário por perfil, para testar o produto.
 * Uso: SEED_DEMO_PASSWORD='senha-com-10+' pnpm --filter @rebania/api seed-demo
 *   ou: pnpm --filter @rebania/api seed-demo --password 'senha-com-10+'
 * Sem senha informada, gera uma aleatória e a mostra só neste terminal.
 * Idempotente: reexecutar redefine as senhas e não duplica dados. Os dados são fictícios
 * e ficam numa organização própria ("Rebania Demonstração (dados fictícios)").
 * Os usuários da demo são clientes: o console da plataforma usa conta própria da equipe
 * (`platform-admin --create`), nunca uma conta com fazenda.
 */
import { parseArgs } from "node:util";
import { createDb } from "@rebania/db";
import { loadConfig } from "../config.ts";
import { randomToken } from "../lib/crypto.ts";
import { seedDemo } from "../lib/demo-seed.ts";

const { values } = parseArgs({
  options: {
    password: { type: "string" },
    timezone: { type: "string", default: "America/Sao_Paulo" },
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
  console.log(`Organização de demonstração: ${result.organizationId}`);
  console.log(`Fazenda: ${result.farmId} (animais criados agora: ${result.animalsCreated})`);
  console.log(`Acesso: ${config.webBaseUrl}/entrar`);
  for (const u of result.users) console.log(`  ${u.role.padEnd(13)} ${u.email}`);
  console.log(
    provided
      ? "Senha: a informada (mesma para todos)."
      : `Senha gerada (mesma para todos): ${password}`,
  );
} finally {
  await db.$disconnect();
}
