import { addDays, todayInTimezone, type Role } from "@rebania/domain";
import type { Db } from "@rebania/db";
import { PasswordPolicy } from "@rebania/contracts";
import { createAnimal, recordWeight } from "../modules/animals/service.ts";
import { recordChange } from "./changes.ts";
import { hashPassword } from "./crypto.ts";
import type { FarmContext } from "./tenant.ts";

/**
 * Organização de demonstração para testar o produto (dados fictícios, isolados em
 * uma organização própria). Idempotente: reexecutar redefine as senhas dos usuários
 * de demonstração e não duplica organização, fazenda nem animais.
 */
export const DEMO_ORG_SLUG = "rebania-demo";
export const DEMO_EMAIL_DOMAIN = "demo.rebania.com.br";

export const DEMO_USERS: { email: string; name: string; role: Role }[] = [
  { email: `dono@${DEMO_EMAIL_DOMAIN}`, name: "Demo · Proprietário", role: "owner" },
  { email: `gerente@${DEMO_EMAIL_DOMAIN}`, name: "Demo · Gerente", role: "manager" },
  { email: `campo@${DEMO_EMAIL_DOMAIN}`, name: "Demo · Equipe de campo", role: "field" },
  { email: `veterinario@${DEMO_EMAIL_DOMAIN}`, name: "Demo · Veterinário", role: "veterinarian" },
  { email: `financeiro@${DEMO_EMAIL_DOMAIN}`, name: "Demo · Financeiro", role: "finance" },
];

interface DemoAnimal {
  tag: string;
  sex: "female" | "male";
  category: "calf_female" | "calf_male" | "heifer" | "steer" | "cow" | "bull";
  ageDays: number;
  group: "Matrizes" | "Recria";
  /** Pesos (kg) da pesagem mais antiga para a mais recente, a cada 60 dias. */
  weights: number[];
}

const ANIMALS: DemoAnimal[] = [
  {
    tag: "3487",
    sex: "male",
    category: "steer",
    ageDays: 730,
    group: "Recria",
    weights: [430, 486],
  },
  {
    tag: "3521",
    sex: "male",
    category: "steer",
    ageDays: 900,
    group: "Recria",
    weights: [468, 512],
  },
  {
    tag: "3600",
    sex: "male",
    category: "steer",
    ageDays: 420,
    group: "Recria",
    weights: [251, 298],
  },
  {
    tag: "3612",
    sex: "male",
    category: "steer",
    ageDays: 450,
    group: "Recria",
    weights: [262, 310],
  },
  {
    tag: "3633",
    sex: "female",
    category: "heifer",
    ageDays: 540,
    group: "Recria",
    weights: [288, 331],
  },
  {
    tag: "3641",
    sex: "female",
    category: "heifer",
    ageDays: 600,
    group: "Recria",
    weights: [301, 342],
  },
  {
    tag: "2104",
    sex: "female",
    category: "cow",
    ageDays: 1800,
    group: "Matrizes",
    weights: [455, 468],
  },
  {
    tag: "2111",
    sex: "female",
    category: "cow",
    ageDays: 2100,
    group: "Matrizes",
    weights: [472, 480],
  },
  {
    tag: "2150",
    sex: "female",
    category: "cow",
    ageDays: 1500,
    group: "Matrizes",
    weights: [438, 451],
  },
  {
    tag: "2177",
    sex: "female",
    category: "cow",
    ageDays: 2400,
    group: "Matrizes",
    weights: [490, 497],
  },
  {
    tag: "1009",
    sex: "male",
    category: "bull",
    ageDays: 1600,
    group: "Matrizes",
    weights: [742, 760],
  },
  {
    tag: "3702",
    sex: "female",
    category: "calf_female",
    ageDays: 150,
    group: "Matrizes",
    weights: [112, 148],
  },
];

export interface DemoSeedResult {
  organizationId: string;
  farmId: string;
  users: { email: string; role: Role }[];
  animalsCreated: number;
}

export async function seedDemo(
  db: Db,
  opts: { password: string; timezone?: string; now?: Date },
): Promise<DemoSeedResult> {
  const password = PasswordPolicy.parse(opts.password);
  const now = opts.now ?? new Date();
  const timezone = opts.timezone ?? "America/Sao_Paulo";
  const passwordHash = await hashPassword(password);

  const base = await db.$transaction(async (tx) => {
    const org =
      (await tx.organization.findUnique({ where: { slug: DEMO_ORG_SLUG } })) ??
      (await tx.organization.create({
        data: { name: "Rebania Demonstração (dados fictícios)", slug: DEMO_ORG_SLUG },
      }));
    const farm =
      (await tx.farm.findFirst({
        where: { organizationId: org.id, archivedAt: null },
        orderBy: { createdAt: "asc" },
      })) ??
      (await tx.farm.create({
        data: { organizationId: org.id, name: "Fazenda Demonstração", timezone },
      }));

    const userIds: Record<string, string> = {};
    for (const u of DEMO_USERS) {
      const user = await tx.user.upsert({
        where: { email: u.email },
        create: { email: u.email, name: u.name, passwordHash },
        update: { passwordHash, disabledAt: null },
      });
      userIds[u.email] = user.id;
      await tx.membership.upsert({
        where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
        create: { organizationId: org.id, userId: user.id, role: u.role, allFarms: true },
        update: { role: u.role, allFarms: true, revokedAt: null },
      });
    }
    // Senha nova invalida sessões abertas com a anterior.
    await tx.authSession.updateMany({
      where: { userId: { in: Object.values(userIds) }, revokedAt: null },
      data: { revokedAt: now, revokedReason: "demo_seed" },
    });
    await tx.auditEntry.create({
      data: {
        organizationId: org.id,
        farmId: farm.id,
        action: "demo.seeded",
        entityType: "organization",
        entityId: org.id,
        data: { users: DEMO_USERS.map((u) => u.email) },
      },
    });
    return { org, farm, ownerId: userIds[DEMO_USERS[0]!.email]! };
  });

  const fctx: FarmContext = {
    userId: base.ownerId,
    organizationId: base.org.id,
    farmId: base.farm.id,
    timezone: base.farm.timezone,
    role: "owner",
  };

  // Dados de exemplo só na primeira execução (fazenda sem animais).
  const existing = await db.animal.count({ where: { farmId: fctx.farmId } });
  let animalsCreated = 0;
  if (existing === 0) {
    await db.$transaction(
      async (tx) => {
        const named = async (kind: "group" | "pasture", name: string) => {
          const data = { organizationId: fctx.organizationId, farmId: fctx.farmId, name };
          const row =
            kind === "group" ? await tx.group.create({ data }) : await tx.pasture.create({ data });
          await recordChange(tx, fctx, kind, row.id);
          return row.id;
        };
        const groups = {
          Matrizes: await named("group", "Matrizes"),
          Recria: await named("group", "Recria"),
        };
        const pastures = {
          Matrizes: await named("pasture", "Pasto da Sede"),
          Recria: await named("pasture", "Área Sul"),
        };
        const today = todayInTimezone(fctx.timezone, now);
        const meta = { now };
        for (const a of ANIMALS) {
          const birthDate = addDays(today, -a.ageDays);
          const { entityId } = await createAnimal(
            tx,
            fctx,
            {
              sex: a.sex,
              category: a.category,
              breed: "Nelore",
              birthDate,
              origin: "born_on_farm",
              groupId: groups[a.group],
              pastureId: pastures[a.group],
              notes: "Animal fictício da demonstração.",
              identifiers: [{ type: "visual_tag", value: a.tag }],
            },
            meta,
          );
          for (const [i, kg] of a.weights.entries()) {
            const daysAgo = (a.weights.length - 1 - i) * 60 + 5;
            await recordWeight(
              tx,
              fctx,
              entityId,
              { weightKg: kg, measuredOn: addDays(today, -Math.min(daysAgo, a.ageDays)) },
              meta,
            );
          }
          animalsCreated++;
        }
      },
      { timeout: 60_000 },
    );
  }

  return {
    organizationId: base.org.id,
    farmId: base.farm.id,
    users: DEMO_USERS.map((u) => ({ email: u.email, role: u.role })),
    animalsCreated,
  };
}
