import { z } from "zod";
import { isValidTimezone } from "@rebania/domain";
import { uuid } from "./common.ts";

export const CreateFarmRequest = z.object({
  name: z.string().trim().min(2).max(120),
  timezone: z
    .string()
    .default("America/Sao_Paulo")
    .refine(isValidTimezone, { message: "Timezone inválido." }),
});

export const CreateNamedRequest = z.object({
  name: z.string().trim().min(1).max(80),
  notes: z.string().trim().max(500).optional(),
});

export const Group = z.object({
  id: uuid,
  farmId: uuid,
  name: z.string(),
  notes: z.string().nullable(),
  activeAnimals: z.number().int(),
  archivedAt: z.string().nullable(),
});
export type Group = z.infer<typeof Group>;

export const Pasture = Group;
export type Pasture = Group;

export const FarmTodaySummary = z.object({
  farmId: uuid,
  today: z.string(),
  activeAnimals: z.number().int(),
  byCategory: z.record(z.string(), z.number().int()),
  females: z.number().int(),
  males: z.number().int(),
  groups: z.number().int(),
  weighedLast30Days: z.number().int(),
  withoutIdentifier: z.number().int(),
  lastChangeAt: z.string().nullable(),
});
export type FarmTodaySummary = z.infer<typeof FarmTodaySummary>;
