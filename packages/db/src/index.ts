import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "./generated/client.ts";

export * from "./generated/client.ts";
export type * from "./generated/models.ts";

export interface CreateDbOptions {
  url: string;
  /** Limite do pool por processo; dimensionar por medição (ver runbook de deploy). */
  max?: number;
}

export function createDb({ url, max = 10 }: CreateDbOptions): PrismaClient {
  // O adapter troca datas com o banco como horário UTC sem fuso explícito; a sessão precisa
  // estar em UTC, senão um servidor em outro fuso grava e compara instantes deslocados.
  const adapter = new PrismaPg({ connectionString: url, max, options: "-c TimeZone=UTC" });
  return new PrismaClient({ adapter });
}

export * from "./queue.ts";

export type Db = PrismaClient;
/** Cliente dentro de `db.$transaction(async (tx) => ...)`. */
export type Tx = Prisma.TransactionClient;
