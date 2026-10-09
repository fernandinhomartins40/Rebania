-- CreateEnum
CREATE TYPE "CommercialKind" AS ENUM ('sale', 'purchase');

-- CreateEnum
CREATE TYPE "PriceMode" AS ENUM ('per_head', 'per_kg_live', 'per_arroba', 'total');

-- CreateEnum
CREATE TYPE "EntryKind" AS ENUM ('income', 'expense');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('open', 'paid', 'cancelled');

-- CreateTable
CREATE TABLE "commercial_transactions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "kind" "CommercialKind" NOT NULL,
    "date" DATE NOT NULL,
    "counterparty" TEXT NOT NULL,
    "document" TEXT,
    "price_mode" "PriceMode" NOT NULL,
    "unit_cents" BIGINT NOT NULL,
    "total_cents" BIGINT NOT NULL,
    "heads" INTEGER NOT NULL,
    "total_live_kg" DECIMAL(12,2),
    "carcass_yield_percent" DECIMAL(5,2),
    "estimated_arrobas" DECIMAL(12,2),
    "formula" TEXT NOT NULL,
    "notes" TEXT,
    "withdrawal_override" JSONB,
    "financial_entry_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(3),
    "void_reason" TEXT,

    CONSTRAINT "commercial_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_items" (
    "transaction_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "live_weight_kg" DECIMAL(8,2),
    "allocated_cents" BIGINT NOT NULL,

    CONSTRAINT "commercial_items_pkey" PRIMARY KEY ("transaction_id","animal_id")
);

-- CreateTable
CREATE TABLE "financial_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "kind" "EntryKind" NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "due_on" DATE NOT NULL,
    "paid_on" DATE,
    "status" "EntryStatus" NOT NULL DEFAULT 'open',
    "counterparty" TEXT,
    "document" TEXT,
    "allocation_type" TEXT NOT NULL DEFAULT 'farm',
    "allocation_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "source_type" TEXT,
    "source_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "cancel_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "financial_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feeding_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "group_id" UUID,
    "date" DATE NOT NULL,
    "diet" TEXT NOT NULL,
    "product_id" UUID,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "heads" INTEGER NOT NULL,
    "cost_cents" BIGINT,
    "stock_movement_id" UUID,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(3),
    "void_reason" TEXT,

    CONSTRAINT "feeding_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commercial_transactions_farm_id_kind_date_idx" ON "commercial_transactions"("farm_id", "kind", "date");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_transactions_farm_id_id_key" ON "commercial_transactions"("farm_id", "id");

-- CreateIndex
CREATE INDEX "commercial_items_animal_id_idx" ON "commercial_items"("animal_id");

-- CreateIndex
CREATE INDEX "financial_entries_farm_id_status_due_on_idx" ON "financial_entries"("farm_id", "status", "due_on");

-- CreateIndex
CREATE INDEX "financial_entries_farm_id_paid_on_idx" ON "financial_entries"("farm_id", "paid_on");

-- CreateIndex
CREATE INDEX "feeding_events_farm_id_date_idx" ON "feeding_events"("farm_id", "date");

-- AddForeignKey
ALTER TABLE "commercial_transactions" ADD CONSTRAINT "commercial_transactions_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_items" ADD CONSTRAINT "commercial_items_farm_id_transaction_id_fkey" FOREIGN KEY ("farm_id", "transaction_id") REFERENCES "commercial_transactions"("farm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_items" ADD CONSTRAINT "commercial_items_farm_id_animal_id_fkey" FOREIGN KEY ("farm_id", "animal_id") REFERENCES "animals"("farm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feeding_events" ADD CONSTRAINT "feeding_events_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feeding_events" ADD CONSTRAINT "feeding_events_farm_id_group_id_fkey" FOREIGN KEY ("farm_id", "group_id") REFERENCES "groups"("farm_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "feeding_events" ADD CONSTRAINT "feeding_events_farm_id_product_id_fkey" FOREIGN KEY ("farm_id", "product_id") REFERENCES "products"("farm_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Regras de integridade (não expressáveis no schema Prisma)
ALTER TABLE "commercial_transactions" ADD CONSTRAINT "commercial_values_chk" CHECK (
  "unit_cents" > 0 AND "total_cents" >= 0 AND "heads" > 0 AND
  ("carcass_yield_percent" IS NULL OR ("carcass_yield_percent" > 0 AND "carcass_yield_percent" <= 70)) AND
  ("price_mode" <> 'per_arroba' OR "carcass_yield_percent" IS NOT NULL)
);
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_amount_chk" CHECK ("amount_cents" > 0);
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_paid_chk" CHECK (("status" = 'paid') = ("paid_on" IS NOT NULL));
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_allocation_chk" CHECK ("allocation_type" IN ('farm', 'group', 'animals'));
ALTER TABLE "feeding_events" ADD CONSTRAINT "feeding_quantity_chk" CHECK ("quantity" > 0 AND "heads" >= 0);
