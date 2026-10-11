import type { Tx } from "@rebania/db";
import { assertPlatformAccountSeparation } from "@rebania/domain";

/**
 * Quem vai ganhar vínculo com uma organização (convite, aceite, implantação) não pode ser
 * da equipe da plataforma. E-mail ainda sem conta passa: a conta nasce como cliente.
 */
export async function assertCanJoinOrganization(tx: Tx, email: string) {
  const user = await tx.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true },
  });
  const staff = user ? await tx.platformAdmin.findUnique({ where: { userId: user.id } }) : null;
  assertPlatformAccountSeparation({ platformAdmin: Boolean(staff), activeMemberships: 1 });
}
