/** Prisma representa @db.Date como Date à meia-noite UTC. */
export function civilToDate(civil: string): Date {
  return new Date(`${civil}T00:00:00.000Z`);
}

export function dateToCivil(d: Date): string;
export function dateToCivil(d: Date | null | undefined): string | null;
export function dateToCivil(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
