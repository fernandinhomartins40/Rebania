/**
 * Implantação: cria organização + primeira fazenda + convite do proprietário.
 * Uso: pnpm --filter @rebania/api bootstrap --org "Agropecuária X" --farm "Fazenda Boa Vista" \
 *        --email dono@exemplo.com [--timezone America/Cuiaba]
 * Executado pelo operador da plataforma no servidor; não existe rota pública equivalente.
 */
import { parseArgs } from "node:util";
import { isValidTimezone } from "@rebania/domain";
import { createDb } from "@rebania/db";
import { loadConfig } from "../config.ts";
import { randomToken, sha256 } from "../lib/crypto.ts";

const { values } = parseArgs({
  options: {
    org: { type: "string" },
    farm: { type: "string" },
    email: { type: "string" },
    timezone: { type: "string", default: "America/Sao_Paulo" },
  },
});

if (!values.org || !values.farm || !values.email) {
  console.error(
    'Uso: bootstrap --org "Nome" --farm "Fazenda" --email dono@exemplo.com [--timezone America/Sao_Paulo]',
  );
  process.exit(1);
}
if (!isValidTimezone(values.timezone!)) {
  console.error("Timezone inválido.");
  process.exit(1);
}

const config = loadConfig();
const db = createDb({ url: config.databaseUrl, max: 2 });
const slugBase = values.org
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");
const token = randomToken();

const result = await db.$transaction(async (tx) => {
  const slugTaken = await tx.organization.count({ where: { slug: { startsWith: slugBase } } });
  const org = await tx.organization.create({
    data: { name: values.org!, slug: slugTaken ? `${slugBase}-${slugTaken + 1}` : slugBase },
  });
  const farm = await tx.farm.create({
    data: { organizationId: org.id, name: values.farm!, timezone: values.timezone! },
  });
  const inv = await tx.invitation.create({
    data: {
      organizationId: org.id,
      email: values.email!.trim().toLowerCase(),
      role: "owner",
      allFarms: true,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + config.invitationTtlMs),
    },
  });
  await tx.auditEntry.create({
    data: {
      organizationId: org.id,
      action: "org.bootstrapped",
      entityType: "organization",
      entityId: org.id,
      data: { farmId: farm.id, invitationId: inv.id },
    },
  });
  return { org, farm, inv };
});

console.log(`Organização: ${result.org.name} (${result.org.id})`);
console.log(`Fazenda:     ${result.farm.name} (${result.farm.id})`);
console.log(
  `Convite do proprietário (${result.inv.email}), válido até ${result.inv.expiresAt.toISOString()}:`,
);
console.log(`${config.webBaseUrl}/convite#token=${token}`);
await db.$disconnect();
