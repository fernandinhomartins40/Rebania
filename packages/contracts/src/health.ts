import {
  ADMIN_ROUTES,
  CATEGORIES,
  EXAM_KINDS,
  HANDLING_ITEM_STATUSES,
  HEALTH_KINDS,
  PRODUCT_KINDS,
  STOCK_MOVEMENT_KINDS,
  TREATMENT_STATUSES,
  UNITS,
} from "@rebania/domain";
import { z } from "zod";
import { civilDate, uuid } from "./common.ts";

export const ProductKindEnum = z.enum(PRODUCT_KINDS);
export const UnitEnum = z.enum(UNITS);
export const AdminRouteEnum = z.enum(ADMIN_ROUTES);
export const HealthKindEnum = z.enum(HEALTH_KINDS);
export const ExamKindEnum = z.enum(EXAM_KINDS);
export const TreatmentStatusEnum = z.enum(TREATMENT_STATUSES);
export const StockMovementKindEnum = z.enum(STOCK_MOVEMENT_KINDS);

const qty = z.number().finite();
const days = z.number().int().min(0).max(365);
const text = (max: number) => z.string().trim().max(max);

// ---- Produtos e estoque ----------------------------------------------------------------

export const ProductInput = z.object({
  name: z.string().trim().min(2).max(120),
  kind: ProductKindEnum,
  unit: UnitEnum,
  minStock: qty.min(0).nullable().optional(),
  withdrawalMeatDays: days.nullable().optional(),
  withdrawalMilkDays: days.nullable().optional(),
  withdrawalSource: text(200).nullable().optional(),
  sireId: uuid.nullable().optional(),
  sireName: text(120).nullable().optional(),
  notes: text(500).nullable().optional(),
});
export type ProductInput = z.input<typeof ProductInput>;

export const UpdateProductInput = ProductInput.partial().extend({
  archived: z.boolean().optional(),
});
export type UpdateProductInput = z.input<typeof UpdateProductInput>;

export const BatchDto = z.object({
  id: uuid,
  code: z.string(),
  expiresOn: z.string().nullable(),
  balance: z.number(),
});
export type BatchDto = z.infer<typeof BatchDto>;

export const ProductDto = z.object({
  id: uuid,
  name: z.string(),
  kind: ProductKindEnum,
  unit: UnitEnum,
  minStock: z.number().nullable(),
  withdrawalMeatDays: z.number().nullable(),
  withdrawalMilkDays: z.number().nullable(),
  withdrawalSource: z.string().nullable(),
  sireId: uuid.nullable(),
  sireName: z.string().nullable(),
  notes: z.string().nullable(),
  archived: z.boolean(),
  balance: z.number(),
  belowMin: z.boolean(),
  /** Movimentos que deixaram saldo negativo aguardando conferência. */
  pendingReview: z.number(),
  batches: z.array(BatchDto),
});
export type ProductDto = z.infer<typeof ProductDto>;

export const LocationInput = z.object({ name: z.string().trim().min(2).max(80) });

export const StockMovementInput = z
  .object({
    productId: uuid,
    kind: StockMovementKindEnum,
    /** Positivo; o sinal vem do tipo. Ajuste aceita negativo. */
    quantity: qty,
    batchId: uuid.nullable().optional(),
    /** Entrada pode criar a partida/lote informando código e validade. */
    batchCode: text(60).optional(),
    expiresOn: civilDate.nullable().optional(),
    locationId: uuid.nullable().optional(),
    unitCost: qty.min(0).nullable().optional(),
    occurredOn: civilDate,
    note: text(300).optional(),
  })
  .refine((v) => v.kind === "adjustment" || v.quantity > 0, {
    message: "Quantidade deve ser maior que zero.",
    path: ["quantity"],
  })
  .refine((v) => v.kind !== "adjustment" || !!v.note?.trim(), {
    message: "Ajuste exige justificativa.",
    path: ["note"],
  });
export type StockMovementInput = z.input<typeof StockMovementInput>;

export const StockMovementDto = z.object({
  id: uuid,
  productId: uuid,
  productName: z.string(),
  unit: z.string(),
  kind: StockMovementKindEnum,
  quantity: z.number(),
  batchCode: z.string().nullable(),
  locationName: z.string().nullable(),
  unitCost: z.number().nullable(),
  occurredOn: z.string(),
  sourceType: z.string().nullable(),
  note: z.string().nullable(),
  needsReview: z.boolean(),
  voided: z.boolean(),
  actorName: z.string().nullable(),
  createdAt: z.string(),
});
export type StockMovementDto = z.infer<typeof StockMovementDto>;

// ---- Aplicações ----------------------------------------------------------------------

export const ApplicationProduct = z.object({
  productId: uuid,
  batchId: uuid.nullable().optional(),
  dose: qty.positive().max(100_000),
  route: AdminRouteEnum.nullable().optional(),
});
export type ApplicationProduct = z.input<typeof ApplicationProduct>;

/** Aplicação em grupo: lista FECHADA dos animais efetivamente tratados. */
export const HealthApplyInput = z
  .object({
    operationId: uuid.optional(),
    kind: HealthKindEnum,
    date: civilDate,
    animalIds: z.array(uuid).min(1).max(2000),
    products: z.array(ApplicationProduct).min(1).max(5),
    applicator: text(120).optional(),
    reason: text(300).optional(),
    planItemId: uuid.nullable().optional(),
    treatmentId: uuid.nullable().optional(),
  })
  .refine((v) => new Set(v.animalIds).size === v.animalIds.length, {
    message: "Animal repetido na lista.",
    path: ["animalIds"],
  })
  .refine((v) => new Set(v.products.map((p) => p.productId)).size === v.products.length, {
    message: "Produto repetido.",
    path: ["products"],
  });
export type HealthApplyInput = z.input<typeof HealthApplyInput>;

export const HealthApplicationDto = z.object({
  id: uuid,
  animalId: uuid,
  kind: HealthKindEnum,
  productId: uuid.nullable(),
  productName: z.string(),
  batchCode: z.string().nullable(),
  dose: z.number().nullable(),
  unit: z.string().nullable(),
  route: AdminRouteEnum.nullable(),
  appliedOn: z.string(),
  applicator: z.string().nullable(),
  reason: z.string().nullable(),
  withdrawalMeatUntil: z.string().nullable(),
  withdrawalMilkUntil: z.string().nullable(),
  sessionId: uuid.nullable(),
  treatmentId: uuid.nullable(),
  voided: z.boolean(),
});
export type HealthApplicationDto = z.infer<typeof HealthApplicationDto>;

// ---- Tratamentos e exames ---------------------------------------------------------------

export const TreatmentInput = z.object({
  id: uuid.optional(),
  animalId: uuid,
  startedOn: civilDate,
  condition: z.string().trim().min(2).max(200),
  plan: text(1000).optional(),
  responsible: text(120).optional(),
});
export type TreatmentInput = z.input<typeof TreatmentInput>;

export const UpdateTreatmentInput = z.object({
  status: TreatmentStatusEnum,
  outcome: text(500).optional(),
  endedOn: civilDate.optional(),
});

export const TreatmentDto = z.object({
  id: uuid,
  animalId: uuid,
  animalTag: z.string().nullable(),
  startedOn: z.string(),
  condition: z.string(),
  plan: z.string().nullable(),
  responsible: z.string().nullable(),
  status: TreatmentStatusEnum,
  outcome: z.string().nullable(),
  endedOn: z.string().nullable(),
  applications: z.array(HealthApplicationDto),
});
export type TreatmentDto = z.infer<typeof TreatmentDto>;

export const ExamInput = z.object({
  operationId: uuid.optional(),
  kind: ExamKindEnum,
  animalIds: z.array(uuid).min(1).max(2000),
  collectedOn: civilDate,
  responsible: text(120).optional(),
  notes: text(500).optional(),
});
export type ExamInput = z.input<typeof ExamInput>;

export const ExamResultInput = z.object({
  result: z.string().trim().min(1).max(500),
  resultOn: civilDate,
});

export const ExamDto = z.object({
  id: uuid,
  animalId: uuid,
  animalTag: z.string().nullable(),
  kind: ExamKindEnum,
  collectedOn: z.string(),
  responsible: z.string().nullable(),
  status: z.enum(["pending", "done"]),
  result: z.string().nullable(),
  resultOn: z.string().nullable(),
  notes: z.string().nullable(),
});
export type ExamDto = z.infer<typeof ExamDto>;

// ---- Calendário sanitário -----------------------------------------------------------------

export const PlanItemInput = z.object({
  name: z.string().trim().min(2).max(120),
  kind: HealthKindEnum,
  productId: uuid.nullable().optional(),
  categories: z.array(z.enum(CATEGORIES)).min(1),
  everyDays: z.number().int().min(1).max(3650).nullable().optional(),
  firstAtAgeDays: z.number().int().min(0).max(3650).nullable().optional(),
  source: z.string().trim().min(3).max(200),
});
export type PlanItemInput = z.input<typeof PlanItemInput>;

export const PlanItemDto = z.object({
  id: uuid,
  name: z.string(),
  kind: HealthKindEnum,
  productId: uuid.nullable(),
  productName: z.string().nullable(),
  categories: z.array(z.enum(CATEGORIES)),
  everyDays: z.number().nullable(),
  firstAtAgeDays: z.number().nullable(),
  source: z.string(),
});
export type PlanItemDto = z.infer<typeof PlanItemDto>;

export const CalendarEntryDto = z.object({
  planItemId: uuid,
  planItemName: z.string(),
  kind: HealthKindEnum,
  status: z.enum(["overdue", "due_soon", "scheduled"]),
  dueOn: z.string(),
  animalIds: z.array(uuid),
  reason: z.string(),
});
export type CalendarEntryDto = z.infer<typeof CalendarEntryDto>;

// ---- Sessão de manejo (Modo Curral) -----------------------------------------------------------

export const HandlingConfig = z
  .object({
    weigh: z.boolean().default(false),
    healthKind: HealthKindEnum.default("vaccination"),
    products: z.array(ApplicationProduct).max(5).default([]),
    applicator: text(120).optional(),
    reason: text(300).optional(),
    planItemId: uuid.nullable().optional(),
  })
  .refine((c) => c.weigh || c.products.length > 0, {
    message: "Escolha ao menos pesagem ou um produto.",
    path: ["products"],
  });
export type HandlingConfig = z.input<typeof HandlingConfig>;

export const HandlingOpenInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    date: civilDate,
    config: HandlingConfig,
    animalIds: z.array(uuid).min(1).max(2000),
  })
  .refine((v) => new Set(v.animalIds).size === v.animalIds.length, {
    message: "Animal repetido na seleção.",
    path: ["animalIds"],
  });
export type HandlingOpenInput = z.input<typeof HandlingOpenInput>;

export const HandlingMarkInput = z.object({
  animalId: uuid,
  status: z.enum(HANDLING_ITEM_STATUSES),
  weightKg: z.number().positive().max(1500).nullable().optional(),
  /** Id da pesagem gerado no aparelho (idempotência). */
  weightId: uuid.optional(),
  weightSource: z.enum(["manual", "scale"]).optional(),
  note: text(300).optional(),
});
export type HandlingMarkInput = z.input<typeof HandlingMarkInput>;

export const HANDLING_EXCEPTION_KINDS = [
  "unknown_identifier",
  "reader_disconnected",
  "not_handled",
  "note",
] as const;

export const HandlingExceptionInput = z.object({
  id: uuid,
  kind: z.enum(HANDLING_EXCEPTION_KINDS),
  value: text(120).optional(),
  note: text(300).optional(),
  resolvedAnimalId: uuid.nullable().optional(),
});
export type HandlingExceptionInput = z.input<typeof HandlingExceptionInput>;

export const HandlingCloseInput = z.object({ note: text(300).optional() });

export const HandlingItemDto = z.object({
  animalId: uuid,
  position: z.number(),
  status: z.enum(HANDLING_ITEM_STATUSES),
  added: z.boolean(),
  weightKg: z.number().nullable(),
  note: z.string().nullable(),
  doneAt: z.string().nullable(),
});
export type HandlingItemDto = z.infer<typeof HandlingItemDto>;

export const SessionSummaryDto = z.object({
  total: z.number(),
  done: z.number(),
  skipped: z.number(),
  pending: z.number(),
  addedDuringSession: z.number(),
  exceptions: z.number(),
});

export const HandlingSessionDto = z.object({
  id: uuid,
  name: z.string(),
  date: z.string(),
  status: z.enum(["open", "closed"]),
  config: z.object({
    weigh: z.boolean(),
    healthKind: HealthKindEnum,
    products: z.array(
      ApplicationProduct.extend({ productName: z.string(), unit: z.string() }).partial({
        productName: true,
        unit: true,
      }),
    ),
    applicator: z.string().optional(),
    reason: z.string().optional(),
    planItemId: uuid.nullable().optional(),
  }),
  items: z.array(HandlingItemDto),
  exceptions: z.array(
    z.object({
      id: uuid,
      kind: z.string(),
      value: z.string().nullable(),
      note: z.string().nullable(),
      resolvedAnimalId: uuid.nullable(),
      createdAt: z.string(),
    }),
  ),
  summary: SessionSummaryDto,
  createdAt: z.string(),
  closedAt: z.string().nullable(),
  version: z.number(),
});
export type HandlingSessionDto = z.infer<typeof HandlingSessionDto>;

export const WithdrawalDto = z.object({
  animalId: uuid,
  animalTag: z.string().nullable(),
  meatUntil: z.string().nullable(),
  milkUntil: z.string().nullable(),
  sources: z.array(
    z.object({
      applicationId: uuid,
      productName: z.string(),
      appliedOn: z.string(),
      meatUntil: z.string().nullable(),
      milkUntil: z.string().nullable(),
      source: z.string().nullable(),
    }),
  ),
});
export type WithdrawalDto = z.infer<typeof WithdrawalDto>;
