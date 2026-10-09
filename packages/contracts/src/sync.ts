import { z } from "zod";
import { uuid } from "./common.ts";
import {
  CreateAnimalInput,
  MoveAnimalInput,
  RecordWeightInput,
  UpdateAnimalInput,
} from "./animal.ts";
import { BirthInput, BreedingInput, PregnancyCheckInput, WeaningInput } from "./repro.ts";

/**
 * Envelope de mutação offline. `organizationId`/tenant NÃO vem do cliente:
 * é derivado da sessão e da fazenda autorizada no servidor.
 */
const Base = z.object({
  mutationId: uuid,
  entityId: uuid,
  occurredAt: z.iso.datetime({ offset: true }),
  createdAt: z.iso.datetime({ offset: true }),
  schemaVersion: z.literal(1),
});

export const SyncMutation = z.discriminatedUnion("type", [
  Base.extend({ type: z.literal("animal.create"), payload: CreateAnimalInput }),
  Base.extend({ type: z.literal("animal.update"), payload: UpdateAnimalInput }),
  Base.extend({ type: z.literal("animal.move"), payload: MoveAnimalInput }),
  /** entityId = animalId; payload.id = id da pesagem (gerado no aparelho) */
  Base.extend({ type: z.literal("weight.record"), payload: RecordWeightInput }),
  /** Operações reprodutivas: entityId = id da operação (gerado no aparelho). */
  Base.extend({ type: z.literal("breeding.record"), payload: BreedingInput }),
  Base.extend({ type: z.literal("pregnancy.record"), payload: PregnancyCheckInput }),
  /** entityId = id do parto */
  Base.extend({ type: z.literal("birth.record"), payload: BirthInput }),
  Base.extend({ type: z.literal("weaning.record"), payload: WeaningInput }),
]);
export type SyncMutation = z.input<typeof SyncMutation>;
export type SyncMutationType = SyncMutation["type"];

export const SYNC_PUSH_MAX = 100;

export const SyncPushRequest = z.object({
  farmId: uuid,
  deviceId: uuid,
  mutations: z.array(z.unknown()).min(1).max(SYNC_PUSH_MAX),
});

export const SyncReceipt = z.discriminatedUnion("status", [
  z.object({
    mutationId: z.string(),
    status: z.literal("accepted"),
    entityId: uuid,
    version: z.number().int().nullable(),
    /** Resultado detalhado (ex.: operação em grupo com exceções). Estável em reenvios. */
    detail: z.unknown().optional(),
  }),
  z.object({
    mutationId: z.string(),
    status: z.literal("rejected"),
    code: z.string(),
    message: z.string(),
  }),
  z.object({
    mutationId: z.string(),
    status: z.literal("conflict"),
    entityId: uuid,
    serverVersion: z.number().int(),
    code: z.string(),
    message: z.string(),
  }),
]);
export type SyncReceipt = z.infer<typeof SyncReceipt>;

export const SyncPushResponse = z.object({
  receipts: z.array(SyncReceipt),
  cursor: z.string(),
});

export const SyncPullQuery = z.object({
  farmId: uuid,
  cursor: z.string().regex(/^\d+$/).default("0"),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const SyncChange = z.object({
  seq: z.string(),
  entity: z.enum(["animal", "group", "pasture", "weight"]),
  entityId: uuid,
  op: z.enum(["upsert", "delete"]),
  data: z.unknown().nullable(),
});
export type SyncChange = z.infer<typeof SyncChange>;

export const SyncPullResponse = z.object({
  changes: z.array(SyncChange),
  cursor: z.string(),
  hasMore: z.boolean(),
});
export type SyncPullResponse = z.infer<typeof SyncPullResponse>;
