/**
 * Concede ou revoga acesso ao console da plataforma (equipe Rebania).
 * Uso: pnpm --filter @rebania/api platform-admin --email pessoa@rebania.com.br [--revoke]
 *      pnpm --filter @rebania/api platform-admin --email pessoa@rebania.com.br --create --name "Nome"
 *      pnpm --filter @rebania/api platform-admin --email pessoa@rebania.com.br --reset-password
 * --create cria a conta (sem organização) com senha provisória; --reset-password gera outra.
 * Conta da equipe nunca tem vínculo com cliente (`assertPlatformAccountSeparation`).
 * A senha provisória aparece só neste terminal e precisa ser trocada no primeiro acesso.
 * Só pelo operador no servidor; não existe rota que conceda este papel.
 */
import { parseArgs } from "node:util";
import { createDb } from "@rebania/db";
import { assertPlatformAccountSeparation } from "@rebania/domain";
import { loadConfig } from "../config.ts";
import { hashPassword, randomToken } from "../lib/crypto.ts";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    create: { type: "boolean", default: false },
    "reset-password": { type: "boolean", default: false },
    revoke: { type: "boolean", default: false },
  },
});
if (!values.email || (values.create && !values.name?.trim())) {
  console.error(
    'Uso: platform-admin --email pessoa@exemplo.com [--revoke | --create --name "Nome" | --reset-password]',
  );
  process.exit(1);
}
const email = values.email.trim().toLowerCase();
const config = loadConfig();
const db = createDb({ url: config.databaseUrl, max: 2 });

let provisional: string | null = null;
let user = await db.user.findUnique({ where: { email } });
if (!user && values.create) {
  provisional = `Prov-${randomToken(9)}`;
  user = await db.user.create({
    data: {
      email,
      name: values.name!.trim(),
      passwordHash: await hashPassword(provisional),
      mustChangePassword: true,
    },
  });
  await db.auditEntry.create({
    data: { action: "user.created", entityType: "user", entityId: user.id, data: { via: "cli" } },
  });
} else if (user && values["reset-password"]) {
  provisional = `Prov-${randomToken(9)}`;
  const now = new Date();
  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(provisional), mustChangePassword: true },
    }),
    db.authSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now, revokedReason: "password_reset" },
    }),
    db.auditEntry.create({
      data: {
        action: "auth.password_reset",
        entityType: "user",
        entityId: user.id,
        data: { via: "cli" },
      },
    }),
  ]);
}
if (!user) {
  console.error(
    "Usuário não encontrado. Use --create --name para criar a conta, ou aceite um convite antes.",
  );
  process.exit(1);
}

if (values.revoke) {
  await db.platformAdmin.deleteMany({ where: { userId: user.id } });
  console.log(`Acesso à plataforma revogado: ${user.email}`);
} else {
  const activeMemberships = await db.membership.count({
    where: { userId: user.id, revokedAt: null },
  });
  try {
    assertPlatformAccountSeparation({ platformAdmin: true, activeMemberships });
  } catch (err) {
    console.error(
      `${(err as Error).message} ${user.email} tem ${activeMemberships} vínculo(s) ativo(s); crie uma conta separada para a equipe.`,
    );
    await db.$disconnect();
    process.exit(1);
  }
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
if (provisional) {
  console.log(`Acesso: ${config.webBaseUrl}/entrar`);
  console.log(`Senha provisória (troca obrigatória no primeiro acesso): ${provisional}`);
}
await db.$disconnect();
