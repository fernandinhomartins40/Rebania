import { CATEGORIES, ENTRY_CATEGORIES, EXIT_KINDS, PRICE_MODES } from "@rebania/domain";
import { z } from "zod";
import { civilDate, uuid } from "./common.ts";
import { IdentifierInput, Sex } from "./animal.ts";

const text = (max: number) => z.string().trim().max(max);
const money = z.number().finite().positive().max(999_999_999);

export const PriceModeEnum = z.enum(PRICE_MODES);

const PriceFields = {
  priceMode: PriceModeEnum,
  /** Reais por unidade (cabeça, kg, arroba) ou total, conforme o modo. */
  unitPrice: money,
  carcassYieldPercent: z.number().positive().max(70).nullable().optional(),
  counterparty: z.string().trim().min(2).max(160),
  document: text(80).optional(),
  notes: text(500).optional(),
  /** Gera a conta a receber/pagar com este vencimento (padrão: data da transação). */
  dueOn: civilDate.optional(),
  paid: z.boolean().default(false),
};

/** Venda: lista FECHADA de animais; carência ativa exige exceção autorizada. */
export const SaleInput = z
  .object({
    id: uuid.optional(),
    date: civilDate,
    items: z
      .array(
        z.object({
          animalId: uuid,
          liveWeightKg: z.number().min(10).max(1500).nullable().optional(),
        }),
      )
      .min(1)
      .max(2000),
    /** Peso total da balança do lote, quando não há peso individual. */
    totalLiveKg: z.number().positive().max(2_000_000).nullable().optional(),
    withdrawalOverride: z
      .object({ reason: z.string().trim().min(10).max(500) })
      .nullable()
      .optional(),
    ...PriceFields,
  })
  .refine((v) => new Set(v.items.map((i) => i.animalId)).size === v.items.length, {
    message: "Animal repetido na venda.",
    path: ["items"],
  });
export type SaleInput = z.input<typeof SaleInput>;

/** Compra: cria os animais (origem comprada) e a conta a pagar numa transação. */
export const PurchaseInput = z.object({
  id: uuid.optional(),
  date: civilDate,
  animals: z
    .array(
      z.object({
        sex: Sex,
        category: z.enum(CATEGORIES),
        breed: text(60).optional(),
        birthDate: civilDate.optional(),
        birthDateEstimated: z.boolean().optional(),
        liveWeightKg: z.number().min(10).max(1500).nullable().optional(),
        identifiers: z.array(IdentifierInput).min(1, "Informe ao menos um identificador.").max(5),
      }),
    )
    .min(1)
    .max(1000),
  groupId: uuid.nullable().optional(),
  pastureId: uuid.nullable().optional(),
  totalLiveKg: z.number().positive().max(2_000_000).nullable().optional(),
  ...PriceFields,
});
export type PurchaseInput = z.input<typeof PurchaseInput>;

export const CommercialDto = z.object({
  id: uuid,
  kind: z.enum(["sale", "purchase"]),
  date: z.string(),
  counterparty: z.string(),
  document: z.string().nullable(),
  priceMode: PriceModeEnum,
  unitCents: z.number(),
  totalCents: z.number(),
  heads: z.number(),
  totalLiveKg: z.number().nullable(),
  carcassYieldPercent: z.number().nullable(),
  estimatedArrobas: z.number().nullable(),
  formula: z.string(),
  notes: z.string().nullable(),
  withdrawalOverride: z
    .object({ reason: z.string(), byUserId: z.string(), byName: z.string().nullable() })
    .nullable(),
  financialEntryId: uuid.nullable(),
  voided: z.boolean(),
  items: z.array(
    z.object({
      animalId: uuid,
      tag: z.string().nullable(),
      liveWeightKg: z.number().nullable(),
      allocatedCents: z.number(),
    }),
  ),
});
export type CommercialDto = z.infer<typeof CommercialDto>;

/** Pré-checagem de venda (sem gravar): pendências por animal. */
export const SaleCheckInput = z.object({
  date: civilDate,
  animalIds: z.array(uuid).min(1).max(2000),
});
export const SaleCheckDto = z.object({
  ok: z.boolean(),
  issues: z.array(
    z.object({
      animalId: uuid,
      tag: z.string().nullable(),
      code: z.string(),
      message: z.string(),
      blocking: z.boolean(),
    }),
  ),
  canOverrideWithdrawal: z.boolean(),
});
export type SaleCheckDto = z.infer<typeof SaleCheckDto>;

// ---- Saída (morte, descarte, transferência) -------------------------------------------------------

export const AnimalExitInput = z.object({
  kind: z.enum(EXIT_KINDS).exclude(["sold"]),
  date: civilDate,
  reason: z.string().trim().min(2).max(300),
  notes: text(500).optional(),
});
export type AnimalExitInput = z.input<typeof AnimalExitInput>;

// ---- Trato ---------------------------------------------------------------------------------------

export const FeedingInput = z.object({
  id: uuid.optional(),
  date: civilDate,
  groupId: uuid.nullable().optional(),
  diet: z.string().trim().min(2).max(160),
  productId: uuid.nullable().optional(),
  quantity: z.number().positive().max(10_000_000),
  /** Unidade quando não há produto do estoque (ex.: kg de capim picado). */
  unit: text(10).optional(),
  notes: text(300).optional(),
});
export type FeedingInput = z.input<typeof FeedingInput>;

export const FeedingDto = z.object({
  id: uuid,
  date: z.string(),
  groupId: uuid.nullable(),
  groupName: z.string().nullable(),
  diet: z.string(),
  productId: uuid.nullable(),
  productName: z.string().nullable(),
  quantity: z.number(),
  unit: z.string(),
  heads: z.number(),
  costCents: z.number().nullable(),
  voided: z.boolean(),
});
export type FeedingDto = z.infer<typeof FeedingDto>;

// ---- Financeiro ----------------------------------------------------------------------------------

export const EntryCategoryEnum = z.enum(ENTRY_CATEGORIES);

export const FinancialEntryInput = z.object({
  kind: z.enum(["income", "expense"]),
  category: EntryCategoryEnum,
  description: z.string().trim().min(2).max(200),
  amount: money,
  dueOn: civilDate,
  paidOn: civilDate.nullable().optional(),
  counterparty: text(160).optional(),
  document: text(80).optional(),
  allocationType: z.enum(["farm", "group", "animals"]).default("farm"),
  allocationIds: z.array(uuid).max(2000).default([]),
});
export type FinancialEntryInput = z.input<typeof FinancialEntryInput>;

export const PayEntryInput = z.object({ paidOn: civilDate });
export const CancelEntryInput = z.object({ reason: z.string().trim().min(3).max(300) });

export const FinancialEntryDto = z.object({
  id: uuid,
  kind: z.enum(["income", "expense"]),
  category: EntryCategoryEnum,
  description: z.string(),
  amountCents: z.number(),
  dueOn: z.string(),
  paidOn: z.string().nullable(),
  status: z.enum(["open", "paid", "cancelled"]),
  counterparty: z.string().nullable(),
  document: z.string().nullable(),
  allocationType: z.enum(["farm", "group", "animals"]),
  allocationIds: z.array(uuid),
  sourceType: z.string().nullable(),
  sourceId: z.string().nullable(),
  cancelReason: z.string().nullable(),
});
export type FinancialEntryDto = z.infer<typeof FinancialEntryDto>;

// ---- Relatórios ----------------------------------------------------------------------------------

export const REPORT_KINDS = [
  "inventory",
  "performance",
  "reproduction",
  "mortality",
  "commercial",
  "financial",
  "feeding",
  "health",
  "confinement",
  "slaughter",
  "result",
  "pastures",
] as const;
export const ReportKindEnum = z.enum(REPORT_KINDS);

export const ReportQuery = z.object({
  from: civilDate,
  to: civilDate,
  format: z.enum(["json", "csv"]).default("json"),
});

export const ReportDto = z.object({
  kind: ReportKindEnum,
  title: z.string(),
  period: z.object({ from: z.string(), to: z.string() }),
  /** Fórmula e critérios em linguagem simples, para auditoria. */
  formula: z.string(),
  coverage: z
    .object({ covered: z.number(), total: z.number(), percent: z.number(), note: z.string() })
    .nullable(),
  columns: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      type: z.enum(["text", "number", "money", "percent"]),
    }),
  ),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
  totals: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).nullable(),
  notes: z.array(z.string()),
});
export type ReportDto = z.infer<typeof ReportDto>;
