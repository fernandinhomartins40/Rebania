import type { Tx } from "@rebania/db";
import { randomToken, sha256 } from "./crypto.ts";

export function slugify(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Implantação: organização + primeira fazenda + convite do proprietário (token só retornado aqui). */
export async function provisionOrganization(
  tx: Tx,
  p: {
    orgName: string;
    farmName: string;
    timezone: string;
    ownerEmail: string;
    invitationTtlMs: number;
    now: Date;
    actorUserId?: string | null;
  },
) {
  const slugBase = slugify(p.orgName) || "organizacao";
  const token = randomToken();
  const slugTaken = await tx.organization.count({ where: { slug: { startsWith: slugBase } } });
  const org = await tx.organization.create({
    data: { name: p.orgName, slug: slugTaken ? `${slugBase}-${slugTaken + 1}` : slugBase },
  });
  const farm = await tx.farm.create({
    data: { organizationId: org.id, name: p.farmName, timezone: p.timezone },
  });
  const inv = await tx.invitation.create({
    data: {
      organizationId: org.id,
      email: p.ownerEmail.trim().toLowerCase(),
      role: "owner",
      allFarms: true,
      tokenHash: sha256(token),
      expiresAt: new Date(p.now.getTime() + p.invitationTtlMs),
      invitedById: p.actorUserId ?? null,
    },
  });
  await tx.auditEntry.create({
    data: {
      organizationId: org.id,
      actorUserId: p.actorUserId ?? null,
      action: "org.bootstrapped",
      entityType: "organization",
      entityId: org.id,
      data: { farmId: farm.id, invitationId: inv.id },
    },
  });
  return { org, farm, inv, token };
}
