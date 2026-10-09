-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('open', 'resolved');

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "is_pen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pen_capacity" INTEGER,
ADD COLUMN     "pen_started_on" DATE;

-- AlterTable
ALTER TABLE "pastures" ADD COLUMN     "area_ha" DECIMAL(10,2),
ADD COLUMN     "rest_target_days" INTEGER;

-- CreateTable
CREATE TABLE "occurrences" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID,
    "target_label" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT NOT NULL,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'open',
    "occurred_on" DATE NOT NULL,
    "resolved_on" DATE,
    "resolution" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bunk_readings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "score" INTEGER NOT NULL,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bunk_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slaughter_returns" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "received_on" DATE NOT NULL,
    "plant" TEXT NOT NULL,
    "price_per_arroba_cents" BIGINT,
    "final_total_cents" BIGINT,
    "notes" TEXT,
    "items" JSONB NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slaughter_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rain_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "mm" DECIMAL(6,1) NOT NULL,
    "pasture_id" UUID,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rain_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "identifier" TEXT,
    "acquired_on" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_maintenances" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "cost_cents" BIGINT,
    "next_due_on" DATE,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_maintenances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "occurrences_farm_id_status_idx" ON "occurrences"("farm_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bunk_readings_group_id_date_key" ON "bunk_readings"("group_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "slaughter_returns_transaction_id_key" ON "slaughter_returns"("transaction_id");

-- CreateIndex
CREATE INDEX "rain_records_farm_id_date_idx" ON "rain_records"("farm_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "assets_farm_id_id_key" ON "assets"("farm_id", "id");

-- CreateIndex
CREATE INDEX "asset_maintenances_asset_id_date_idx" ON "asset_maintenances"("asset_id", "date");

-- AddForeignKey
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bunk_readings" ADD CONSTRAINT "bunk_readings_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bunk_readings" ADD CONSTRAINT "bunk_readings_farm_id_group_id_fkey" FOREIGN KEY ("farm_id", "group_id") REFERENCES "groups"("farm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slaughter_returns" ADD CONSTRAINT "slaughter_returns_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rain_records" ADD CONSTRAINT "rain_records_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rain_records" ADD CONSTRAINT "rain_records_farm_id_pasture_id_fkey" FOREIGN KEY ("farm_id", "pasture_id") REFERENCES "pastures"("farm_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_maintenances" ADD CONSTRAINT "asset_maintenances_farm_id_asset_id_fkey" FOREIGN KEY ("farm_id", "asset_id") REFERENCES "assets"("farm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Regras de integridade
ALTER TABLE "bunk_readings" ADD CONSTRAINT "bunk_score_chk" CHECK ("score" BETWEEN 0 AND 5);
ALTER TABLE "rain_records" ADD CONSTRAINT "rain_mm_chk" CHECK ("mm" >= 0 AND "mm" <= 500);
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrence_severity_chk" CHECK ("severity" IN ('low', 'medium', 'high'));
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrence_target_chk" CHECK ("target_type" IN ('animal', 'group', 'pasture', 'equipment', 'other'));
ALTER TABLE "groups" ADD CONSTRAINT "groups_pen_capacity_chk" CHECK ("pen_capacity" IS NULL OR "pen_capacity" > 0);
ALTER TABLE "pastures" ADD CONSTRAINT "pastures_area_chk" CHECK ("area_ha" IS NULL OR "area_ha" > 0);
