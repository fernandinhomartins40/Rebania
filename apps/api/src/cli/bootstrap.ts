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
import { provisionOrganization } from "../lib/provision.ts";

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
const result = await db.$transaction((tx) =>
  provisionOrganization(tx, {
    orgName: values.org!,
    farmName: values.farm!,
    timezone: values.timezone!,
    ownerEmail: values.email!,
    invitationTtlMs: config.invitationTtlMs,
    now: new Date(),
  }),
);

console.log(`Organização: ${result.org.name} (${result.org.id})`);
console.log(`Fazenda:     ${result.farm.name} (${result.farm.id})`);
console.log(
  `Convite do proprietário (${result.inv.email}), válido até ${result.inv.expiresAt.toISOString()}:`,
);
console.log(`${config.webBaseUrl}/convite#token=${result.token}`);
await db.$disconnect();
