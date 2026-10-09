-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('vaccine', 'antiparasitic', 'medicine', 'hormone', 'semen', 'feed', 'supplement', 'other');

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('entry', 'consumption', 'loss', 'adjustment');

-- CreateEnum
CREATE TYPE "HealthKind" AS ENUM ('vaccination', 'deworming', 'treatment', 'other');

-- CreateEnum
CREATE TYPE "AdminRoute" AS ENUM ('subcutaneous', 'intramuscular', 'intravenous', 'oral', 'pour_on', 'intramammary', 'intrauterine', 'other');

-- CreateEnum
CREATE TYPE "TreatmentStatus" AS ENUM ('open', 'resolved', 'failed');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('pending', 'done');

-- CreateEnum
CREATE TYPE "HandlingSessionStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "HandlingItemStatus" AS ENUM ('pending', 'done', 'skipped');

-- AlterTable
ALTER TABLE "animals" ADD COLUMN     "withdrawal_meat_until" DATE,
ADD COLUMN     "withdrawal_milk_until" DATE;

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ProductKind" NOT NULL,
    "unit" TEXT NOT NULL,
    "min_stock" DECIMAL(14,3),
    "withdrawal_meat_days" INTEGER,
    "withdrawal_milk_days" INTEGER,
    "withdrawal_source" TEXT,
    "sire_id" UUID,
    "sire_name" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_batches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "expires_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_locations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "batch_id" UUID,
    "location_id" UUID,
    "kind" "StockMovementKind" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_cost" DECIMAL(14,4),
    "occurred_on" DATE NOT NULL,
    "source_type" TEXT,
    "source_id" UUID,
    "note" TEXT,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_at" TIMESTAMPTZ(3),
    "reviewed_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(3),
    "void_reason" TEXT,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_plan_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "HealthKind" NOT NULL,
    "product_id" UUID,
    "categories" "AnimalCategory"[],
    "every_days" INTEGER,
    "first_at_age_days" INTEGER,
    "source" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "health_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_applications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "kind" "HealthKind" NOT NULL,
    "product_id" UUID,
    "product_name" TEXT NOT NULL,
    "batch_id" UUID,
    "dose" DECIMAL(12,3),
    "unit" TEXT,
    "route" "AdminRoute",
    "applied_on" DATE NOT NULL,
    "applicator" TEXT,
    "reason" TEXT,
    "plan_item_id" UUID,
    "session_id" UUID,
    "treatment_id" UUID,
    "withdrawal_meat_until" DATE,
    "withdrawal_milk_until" DATE,
    "stock_movement_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(3),
    "void_reason" TEXT,

    CONSTRAINT "health_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "started_on" DATE NOT NULL,
    "condition" TEXT NOT NULL,
    "plan" TEXT,
    "responsible" TEXT,
    "status" "TreatmentStatus" NOT NULL DEFAULT 'open',
    "outcome" TEXT,
    "ended_on" DATE,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "treatments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "collected_on" DATE NOT NULL,
    "responsible" TEXT,
    "status" "ExamStatus" NOT NULL DEFAULT 'pending',
    "result" TEXT,
    "result_on" DATE,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(3),
    "void_reason" TEXT,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handling_sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "HandlingSessionStatus" NOT NULL DEFAULT 'open',
    "config" JSONB NOT NULL,
    "summary" JSONB,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),
    "closed_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "handling_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handling_session_items" (
    "session_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "HandlingItemStatus" NOT NULL DEFAULT 'pending',
    "added" BOOLEAN NOT NULL DEFAULT false,
    "weight_id" UUID,
    "note" TEXT,
    "done_at" TIMESTAMPTZ(3),
    "done_by_id" UUID,

    CONSTRAINT "handling_session_items_pkey" PRIMARY KEY ("session_id","animal_id")
);

-- CreateTable
CREATE TABLE "handling_session_exceptions" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT,
    "note" TEXT,
    "resolved_animal_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handling_session_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_farm_id_kind_idx" ON "products"("farm_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "products_farm_id_id_key" ON "products"("farm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "product_batches_farm_id_id_key" ON "product_batches"("farm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "product_batches_product_id_code_key" ON "product_batches"("product_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "stock_locations_farm_id_id_key" ON "stock_locations"("farm_id", "id");

-- CreateIndex
CREATE INDEX "stock_movements_farm_id_product_id_idx" ON "stock_movements"("farm_id", "product_id");

-- CreateIndex
CREATE INDEX "stock_movements_farm_id_needs_review_idx" ON "stock_movements"("farm_id", "needs_review");

-- CreateIndex
CREATE INDEX "stock_movements_source_type_source_id_idx" ON "stock_movements"("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "health_plan_items_farm_id_id_key" ON "health_plan_items"("farm_id", "id");

-- CreateIndex
CREATE INDEX "health_applications_animal_id_applied_on_idx" ON "health_applications"("animal_id", "applied_on");

-- CreateIndex
CREATE INDEX "health_applications_farm_id_applied_on_idx" ON "health_applications"("farm_id", "applied_on");

-- CreateIndex
CREATE INDEX "health_applications_farm_id_operation_id_idx" ON "health_applications"("farm_id", "operation_id");

-- CreateIndex
CREATE INDEX "treatments_farm_id_status_idx" ON "treatments"("farm_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "treatments_farm_id_id_key" ON "treatments"("farm_id", "id");

-- CreateIndex
CREATE INDEX "exams_farm_id_status_idx" ON "exams"("farm_id", "status");

-- CreateIndex
CREATE INDEX "exams_animal_id_collected_on_idx" ON "exams"("animal_id", "collected_on");

-- CreateIndex
CREATE INDEX "handling_sessions_farm_id_status_idx" ON "handling_sessions"("farm_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "handling_sessions_farm_id_id_key" ON "handling_sessions"("farm_id", "id");

-- CreateIndex
CREATE INDEX "handling_session_exceptions_session_id_idx" ON "handling_session_exceptions"("session_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_sire_id_fkey" FOREIGN KEY ("organization_id", "sire_id") REFERENCES "animals"("organization_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_farm_id_product_id_fkey" FOREIGN KEY ("farm_id", "product_id") REFERENCES "products"("farm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_farm_id_product_id_fkey" FOREIGN KEY ("farm_id", "product_id") REFERENCES "products"("farm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_farm_id_batch_id_fkey" FOREIGN KEY ("farm_id", "batch_id") REFERENCES "product_batches"("farm_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_farm_id_location_id_fkey" FOREIGN KEY ("farm_id", "location_id") REFERENCES "stock_locations"("farm_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "health_plan_items" ADD CONSTRAINT "health_plan_items_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_plan_items" ADD CONSTRAINT "health_plan_items_farm_id_product_id_fkey" FOREIGN KEY ("farm_id", "product_id") REFERENCES "products"("farm_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "health_applications" ADD CONSTRAINT "health_applications_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_applications" ADD CONSTRAINT "health_applications_organization_id_animal_id_fkey" FOREIGN KEY ("organization_id", "animal_id") REFERENCES "animals"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_applications" ADD CONSTRAINT "health_applications_farm_id_product_id_fkey" FOREIGN KEY ("farm_id", "product_id") REFERENCES "products"("farm_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "health_applications" ADD CONSTRAINT "health_applications_farm_id_batch_id_fkey" FOREIGN KEY ("farm_id", "batch_id") REFERENCES "product_batches"("farm_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "health_applications" ADD CONSTRAINT "health_applications_farm_id_plan_item_id_fkey" FOREIGN KEY ("farm_id", "plan_item_id") REFERENCES "health_plan_items"("farm_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "health_applications" ADD CONSTRAINT "health_applications_farm_id_session_id_fkey" FOREIGN KEY ("farm_id", "session_id") REFERENCES "handling_sessions"("farm_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "health_applications" ADD CONSTRAINT "health_applications_farm_id_treatment_id_fkey" FOREIGN KEY ("farm_id", "treatment_id") REFERENCES "treatments"("farm_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_organization_id_animal_id_fkey" FOREIGN KEY ("organization_id", "animal_id") REFERENCES "animals"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_organization_id_animal_id_fkey" FOREIGN KEY ("organization_id", "animal_id") REFERENCES "animals"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handling_sessions" ADD CONSTRAINT "handling_sessions_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handling_session_items" ADD CONSTRAINT "handling_session_items_farm_id_session_id_fkey" FOREIGN KEY ("farm_id", "session_id") REFERENCES "handling_sessions"("farm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handling_session_items" ADD CONSTRAINT "handling_session_items_farm_id_animal_id_fkey" FOREIGN KEY ("farm_id", "animal_id") REFERENCES "animals"("farm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handling_session_exceptions" ADD CONSTRAINT "handling_session_exceptions_farm_id_session_id_fkey" FOREIGN KEY ("farm_id", "session_id") REFERENCES "handling_sessions"("farm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Regras de integridade (não expressáveis no schema Prisma)
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sign_chk" CHECK (
  ("kind" = 'entry' AND "quantity" > 0) OR
  ("kind" IN ('consumption', 'loss') AND "quantity" < 0) OR
  ("kind" = 'adjustment' AND "quantity" <> 0)
);
ALTER TABLE "products" ADD CONSTRAINT "products_withdrawal_chk" CHECK (
  ("withdrawal_meat_days" IS NULL OR "withdrawal_meat_days" BETWEEN 0 AND 365) AND
  ("withdrawal_milk_days" IS NULL OR "withdrawal_milk_days" BETWEEN 0 AND 365) AND
  (("withdrawal_meat_days" IS NULL AND "withdrawal_milk_days" IS NULL) OR "withdrawal_source" IS NOT NULL)
);
ALTER TABLE "products" ADD CONSTRAINT "products_min_stock_chk" CHECK ("min_stock" IS NULL OR "min_stock" >= 0);
ALTER TABLE "health_applications" ADD CONSTRAINT "health_applications_dose_chk" CHECK ("dose" IS NULL OR "dose" > 0);
ALTER TABLE "health_plan_items" ADD CONSTRAINT "health_plan_items_interval_chk" CHECK (
  ("every_days" IS NULL OR "every_days" BETWEEN 1 AND 3650) AND
  ("first_at_age_days" IS NULL OR "first_at_age_days" BETWEEN 0 AND 3650)
);
-- Nome de produto ativo único por fazenda (sem diferenciar maiúsculas).
CREATE UNIQUE INDEX "products_farm_name_active_key" ON "products" ("farm_id", lower("name")) WHERE "archived_at" IS NULL;
-- Uma aplicação por animal/produto/operação: retry nunca duplica.
CREATE UNIQUE INDEX "health_applications_op_key" ON "health_applications" ("operation_id", "animal_id", "product_name") WHERE "voided_at" IS NULL;
