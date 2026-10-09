import {
  ASSISTANCE,
  BREEDING_KINDS,
  MAX_CALVES_PER_BIRTH,
  PREGNANCY_RESULTS,
  REPRO_STATUSES,
} from "@rebania/domain";
import { z } from "zod";
import { civilDate, uuid } from "./common.ts";
import { IdentifierInput, Sex } from "./animal.ts";

export const BreedingKind = z.enum(BREEDING_KINDS);
export const PregnancyResultEnum = z.enum(PREGNANCY_RESULTS);
export const ReproStatusEnum = z.enum(REPRO_STATUSES);

export const ReproSettingsInput = z.object({
  gestationDays: z.number().int().min(260).max(310),
  calvingWindowDays: z.number().int().min(0).max(30),
  pregnancyCheckAfterDays: z.number().int().min(25).max(120),
  weaningAgeDays: z.number().int().min(90).max(300),
});
export type ReproSettingsInput = z.infer<typeof ReproSettingsInput>;

export const FarmSettings = z.object({
  name: z.string(),
  timezone: z.string(),
  repro: ReproSettingsInput,
});
export type FarmSettings = z.infer<typeof FarmSettings>;

export const UpdateFarmSettingsInput = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  repro: ReproSettingsInput.partial().optional(),
});

/** Operação em grupo: lista FECHADA dos animais efetivamente manejados (snapshot). */
export const BreedingInput = z
  .object({
    operationId: uuid.optional(),
    kind: BreedingKind,
    date: civilDate,
    endDate: civilDate.optional(),
    femaleIds: z.array(uuid).min(1).max(1000),
    sireId: uuid.nullable().optional(),
    semen: z.string().trim().max(120).optional(),
    /** Baixa de 1 dose por fêmea no estoque de sêmen (IA). */
    semenProductId: uuid.nullable().optional(),
    semenBatchId: uuid.nullable().optional(),
    technician: z.string().trim().max(120).optional(),
    seasonId: uuid.nullable().optional(),
    executionId: uuid.nullable().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.date, {
    message: "Fim da exposição antes do início.",
    path: ["endDate"],
  })
  .refine((v) => new Set(v.femaleIds).size === v.femaleIds.length, {
    message: "Animal repetido na lista.",
    path: ["femaleIds"],
  });
export type BreedingInput = z.input<typeof BreedingInput>;

export const PregnancyCheckInput = z
  .object({
    operationId: uuid.optional(),
    date: civilDate,
    method: z.enum(["ultrasound", "palpation", "other"]).default("ultrasound"),
    examiner: z.string().trim().max(120).optional(),
    seasonId: uuid.nullable().optional(),
    results: z
      .array(
        z.object({
          animalId: uuid,
          result: PregnancyResultEnum,
          estimatedGestationDays: z.number().int().min(1).max(300).nullable().optional(),
          notes: z.string().trim().max(300).optional(),
        }),
      )
      .min(1)
      .max(1000),
  })
  .refine((v) => new Set(v.results.map((r) => r.animalId)).size === v.results.length, {
    message: "Animal repetido na lista.",
    path: ["results"],
  });
export type PregnancyCheckInput = z.input<typeof PregnancyCheckInput>;

export const CalfInput = z
  .object({
    id: uuid.optional(),
    sex: Sex,
    stillborn: z.boolean().default(false),
    identifiers: z.array(IdentifierInput).max(3).default([]),
    weightKg: z.number().positive().max(80).nullable().optional(),
    groupId: uuid.nullable().optional(),
  })
  .refine((c) => c.stillborn || c.identifiers.length > 0, {
    message: "Informe o brinco ou um ID provisório da cria.",
    path: ["identifiers"],
  });

export const BirthInput = z.object({
  id: uuid.optional(),
  damId: uuid,
  date: civilDate,
  assistance: z.enum(ASSISTANCE).default("none"),
  notes: z.string().trim().max(500).optional(),
  calves: z.array(CalfInput).min(1).max(MAX_CALVES_PER_BIRTH),
});
export type BirthInput = z.input<typeof BirthInput>;

export const WeaningInput = z.object({
  operationId: uuid.optional(),
  date: civilDate,
  items: z
    .array(
      z.object({ animalId: uuid, weightKg: z.number().positive().max(600).nullable().optional() }),
    )
    .min(1)
    .max(1000),
});
export type WeaningInput = z.input<typeof WeaningInput>;

export const VoidInput = z.object({ reason: z.string().trim().min(3).max(300) });

export const GroupOperationResult = z.object({
  operationId: z.string(),
  done: z.array(uuid),
  exceptions: z.array(z.object({ animalId: uuid, code: z.string(), message: z.string() })),
});
export type GroupOperationResult = z.infer<typeof GroupOperationResult>;

export const SeasonInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    startDate: civilDate,
    endDate: civilDate,
    notes: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "Fim antes do início.", path: ["endDate"] });

export const ProtocolStep = z.object({
  day: z.number().int().min(0).max(60),
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  /** Etapa de inseminação: a execução registra IA para os animais confirmados. */
  inseminate: z.boolean().default(false),
});

export const ProtocolInput = z.object({
  name: z.string().trim().min(2).max(80),
  responsible: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  steps: z
    .array(ProtocolStep)
    .min(1)
    .max(12)
    .refine((s) => s.every((x, i) => i === 0 || x.day >= s[i - 1]!.day), {
      message: "Etapas devem estar em ordem de dia.",
    }),
});
export type ProtocolInput = z.input<typeof ProtocolInput>;

export const ExecutionInput = z.object({
  protocolId: uuid,
  startDate: civilDate,
  animalIds: z.array(uuid).min(1).max(1000),
  seasonId: uuid.nullable().optional(),
});

export const TaskDto = z.object({
  id: uuid,
  type: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  dueOn: z.string(),
  status: z.enum(["open", "done", "cancelled"]),
  animalIds: z.array(uuid),
  sourceType: z.string().nullable(),
  sourceId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  completedAt: z.string().nullable(),
  resolution: z.string().nullable(),
});
export type TaskDto = z.infer<typeof TaskDto>;

export const CreateTaskInput = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  dueOn: civilDate,
  animalIds: z.array(uuid).max(1000).default([]),
});

export const CompleteTaskInput = z.object({ resolution: z.string().trim().max(500).optional() });
export const CancelTaskInput = z.object({ resolution: z.string().trim().min(3).max(500) });

export const ExpectedCalvingDto = z.object({
  animalId: uuid,
  tag: z.string().nullable(),
  groupName: z.string().nullable(),
  date: z.string(),
  windowStart: z.string(),
  windowEnd: z.string(),
  source: z.string(),
  overdue: z.boolean(),
});
export type ExpectedCalvingDto = z.infer<typeof ExpectedCalvingDto>;
