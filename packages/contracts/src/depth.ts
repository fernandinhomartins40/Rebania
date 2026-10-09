import { ASSET_KINDS, OCCURRENCE_SEVERITIES, OCCURRENCE_TARGETS } from "@rebania/domain";
import { z } from "zod";
import { civilDate, uuid } from "./common.ts";

const text = (max: number) => z.string().trim().max(max);

export const OccurrenceInput = z.object({
  id: uuid.optional(),
  targetType: z.enum(OCCURRENCE_TARGETS),
  targetId: uuid.nullable().optional(),
  targetLabel: text(120).optional(),
  title: z.string().trim().min(2).max(160),
  description: text(2000).optional(),
  severity: z.enum(OCCURRENCE_SEVERITIES),
  occurredOn: civilDate,
});
export type OccurrenceInput = z.input<typeof OccurrenceInput>;

export const ResolveOccurrenceInput = z.object({
  resolution: z.string().trim().min(2).max(1000),
  resolvedOn: civilDate,
});

export const OccurrenceDto = z.object({
  id: uuid,
  targetType: z.enum(OCCURRENCE_TARGETS),
  targetId: uuid.nullable(),
  targetLabel: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  severity: z.enum(OCCURRENCE_SEVERITIES),
  status: z.enum(["open", "resolved"]),
  occurredOn: z.string(),
  resolvedOn: z.string().nullable(),
  resolution: z.string().nullable(),
  authorName: z.string().nullable(),
});
export type OccurrenceDto = z.infer<typeof OccurrenceDto>;

export const PenInput = z.object({
  isPen: z.boolean(),
  penCapacity: z.number().int().positive().max(100_000).nullable().optional(),
  penStartedOn: civilDate.nullable().optional(),
});

export const BunkReadingInput = z.object({
  groupId: uuid,
  date: civilDate,
  score: z.number().int().min(0).max(5),
  notes: text(300).optional(),
});

export const SlaughterReturnInput = z.object({
  receivedOn: civilDate,
  plant: z.string().trim().min(2).max(160),
  items: z
    .array(
      z.object({
        animalId: uuid,
        carcassKg: z.number().positive().max(1000),
        grade: text(40).optional(),
      }),
    )
    .min(1)
    .max(2000),
  pricePerArroba: z.number().positive().max(100_000).nullable().optional(),
  finalTotal: z.number().positive().max(999_999_999).nullable().optional(),
  notes: text(500).optional(),
});
export type SlaughterReturnInput = z.input<typeof SlaughterReturnInput>;

export const PastureUpdateInput = z.object({
  areaHa: z.number().positive().max(1_000_000).nullable().optional(),
  restTargetDays: z.number().int().min(1).max(365).nullable().optional(),
});

export const RainInput = z.object({
  date: civilDate,
  mm: z.number().min(0).max(500),
  pastureId: uuid.nullable().optional(),
  notes: text(300).optional(),
});

export const AssetInput = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(ASSET_KINDS),
  identifier: text(80).optional(),
  acquiredOn: civilDate.nullable().optional(),
  notes: text(500).optional(),
});

export const MaintenanceInput = z.object({
  date: civilDate,
  description: z.string().trim().min(2).max(300),
  cost: z.number().positive().max(99_999_999).nullable().optional(),
  nextDueOn: civilDate.nullable().optional(),
});
