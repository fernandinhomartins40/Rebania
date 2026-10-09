import { z } from "zod";
import {
  ANIMAL_STATUSES,
  CATEGORIES,
  IDENTIFIER_TYPES,
  ORIGINS,
  SEXES,
  WEIGHT_SOURCES,
} from "@rebania/domain";
import { civilDate, uuid } from "./common.ts";

export const Sex = z.enum(SEXES);
export const Category = z.enum(CATEGORIES);
export const AnimalStatus = z.enum(ANIMAL_STATUSES);
export const Origin = z.enum(ORIGINS);
export const IdentifierType = z.enum(IDENTIFIER_TYPES);
export const WeightSource = z.enum(WEIGHT_SOURCES);

export const IdentifierInput = z.object({
  type: IdentifierType,
  value: z.string().trim().min(1).max(200),
});
export type IdentifierInput = z.infer<typeof IdentifierInput>;

/** Cadastro mínimo: identificador (brinco ou provisório), sexo, categoria, origem. */
export const CreateAnimalInput = z.object({
  id: uuid.optional(),
  sex: Sex,
  category: Category,
  breed: z.string().trim().max(60).optional(),
  birthDate: civilDate.optional(),
  birthDateEstimated: z.boolean().default(false),
  origin: Origin,
  entryDate: civilDate.optional(),
  groupId: uuid.nullable().optional(),
  pastureId: uuid.nullable().optional(),
  damId: uuid.nullable().optional(),
  sireId: uuid.nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
  identifiers: z.array(IdentifierInput).min(1, "Informe ao menos um identificador.").max(5),
});
export type CreateAnimalInput = z.input<typeof CreateAnimalInput>;

export const UpdateAnimalInput = z.object({
  expectedVersion: z.number().int().positive(),
  patch: z
    .object({
      breed: z.string().trim().max(60).nullable(),
      birthDate: civilDate.nullable(),
      birthDateEstimated: z.boolean(),
      category: Category,
      notes: z.string().trim().max(2000).nullable(),
      damId: uuid.nullable(),
      sireId: uuid.nullable(),
    })
    .partial()
    .refine((p) => Object.keys(p).length > 0, { message: "Nada a alterar." }),
});
export type UpdateAnimalInput = z.input<typeof UpdateAnimalInput>;

export const MoveAnimalInput = z.object({
  expectedVersion: z.number().int().positive(),
  groupId: uuid.nullable(),
  pastureId: uuid.nullable(),
  effectiveOn: civilDate,
  reason: z.string().trim().max(300).optional(),
});
export type MoveAnimalInput = z.input<typeof MoveAnimalInput>;

export const RecordWeightInput = z.object({
  id: uuid.optional(),
  weightKg: z.number().positive().max(1500),
  measuredOn: civilDate,
  source: WeightSource.default("manual"),
  notes: z.string().trim().max(500).optional(),
});
export type RecordWeightInput = z.input<typeof RecordWeightInput>;

export const AddIdentifierInput = IdentifierInput.extend({
  /** Retag: aposenta identificadores ativos do mesmo tipo, preservando-os no histórico. */
  replaceActiveOfSameType: z.boolean().default(false),
  reason: z.string().trim().max(300).optional(),
});

export const Identifier = z.object({
  id: uuid,
  type: IdentifierType,
  value: z.string(),
  display: z.string(),
  status: z.enum(["active", "retired"]),
  createdAt: z.string(),
  retiredAt: z.string().nullable(),
});
export type Identifier = z.infer<typeof Identifier>;

export const Animal = z.object({
  id: uuid,
  farmId: uuid,
  sex: Sex,
  category: Category,
  status: AnimalStatus,
  breed: z.string().nullable(),
  birthDate: z.string().nullable(),
  birthDateEstimated: z.boolean(),
  origin: Origin,
  entryDate: z.string().nullable(),
  groupId: z.uuid().nullable(),
  groupName: z.string().nullable(),
  pastureId: z.uuid().nullable(),
  pastureName: z.string().nullable(),
  damId: z.uuid().nullable(),
  sireId: z.uuid().nullable(),
  notes: z.string().nullable(),
  version: z.number().int(),
  identifiers: z.array(Identifier),
  primaryIdentifier: z.string().nullable(),
  lastWeight: z.object({ weightKg: z.number(), measuredOn: z.string() }).nullable(),
  /** Foto mais recente pronta (rotas autenticadas). */
  photo: z.object({ id: uuid, thumbUrl: z.string(), displayUrl: z.string() }).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Animal = z.infer<typeof Animal>;

export const AnimalListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: AnimalStatus.optional(),
  category: Category.optional(),
  sex: Sex.optional(),
  groupId: uuid.optional(),
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const TimelineEntry = z.object({
  id: uuid,
  type: z.string(),
  occurredOn: z.string(),
  summary: z.string(),
  data: z.record(z.string(), z.unknown()),
  actorName: z.string().nullable(),
  recordedAt: z.string(),
});
export type TimelineEntry = z.infer<typeof TimelineEntry>;

export const WeightEntry = z.object({
  id: uuid,
  weightKg: z.number(),
  measuredOn: z.string(),
  source: WeightSource,
  notes: z.string().nullable(),
});
export type WeightEntry = z.infer<typeof WeightEntry>;

export const AnimalHistory = z.object({
  animalId: uuid,
  timeline: z.array(TimelineEntry),
  weights: z.array(WeightEntry),
  adg: z
    .object({ adgKgPerDay: z.number(), days: z.number(), from: z.string(), to: z.string() })
    .nullable(),
});
export type AnimalHistory = z.infer<typeof AnimalHistory>;

export const ResolveIdentifierResult = z.object({
  query: z.string(),
  matches: z.array(
    z.object({
      animalId: uuid,
      identifierType: IdentifierType,
      identifierStatus: z.enum(["active", "retired"]),
      display: z.string(),
      animalStatus: AnimalStatus,
      category: Category,
    }),
  ),
});
