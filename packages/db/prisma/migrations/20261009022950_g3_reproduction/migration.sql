-- CreateEnum
CREATE TYPE "BreedingKind" AS ENUM ('artificial_insemination', 'natural_service', 'cleanup_bull');

-- CreateEnum
CREATE TYPE "PregnancyResult" AS ENUM ('pregnant', 'open', 'inconclusive');

-- CreateEnum
CREATE TYPE "ReproStatus" AS ENUM ('open', 'bred', 'pregnant', 'unknown');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('open', 'done', 'cancelled');

-- AlterTable
ALTER TABLE "animals" ADD COLUMN     "expected_calving_on" DATE,
ADD COLUMN     "repro_status" "ReproStatus",
ADD COLUMN     "repro_status_since" DATE;

-- CreateTable
CREATE TABLE "breeding_seasons" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "breeding_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repro_protocols" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "lineage_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "responsible" TEXT,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_at" TIMESTAMPTZ(3),

    CONSTRAINT "repro_protocols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocol_executions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "protocol_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "animal_ids" UUID[],
    "season_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protocol_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breeding_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "female_id" UUID NOT NULL,
    "kind" "BreedingKind" NOT NULL,
    "date" DATE NOT NULL,
    "end_date" DATE,
    "sire_id" UUID,
    "semen" TEXT,
    "technician" TEXT,
    "season_id" UUID,
    "execution_id" UUID,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(3),
    "void_reason" TEXT,

    CONSTRAINT "breeding_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pregnancy_checks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "female_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "result" "PregnancyResult" NOT NULL,
    "method" TEXT,
    "examiner" TEXT,
    "estimated_gestation_days" INTEGER,
    "season_id" UUID,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(3),
    "void_reason" TEXT,

    CONSTRAINT "pregnancy_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "births" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "dam_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "assistance" TEXT NOT NULL DEFAULT 'none',
    "sire_id" UUID,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "births_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "birth_calves" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "birth_id" UUID NOT NULL,
    "animal_id" UUID,
    "sex" "AnimalSex" NOT NULL,
    "stillborn" BOOLEAN NOT NULL DEFAULT false,
    "birth_weight_kg" DECIMAL(6,2),

    CONSTRAINT "birth_calves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_on" DATE NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "animal_ids" UUID[],
    "assignee_id" UUID,
    "source_type" TEXT,
    "source_id" UUID,
    "dedupe_key" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "completed_by_id" UUID,
    "resolution" TEXT,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "breeding_seasons_farm_id_id_key" ON "breeding_seasons"("farm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "repro_protocols_lineage_id_version_key" ON "repro_protocols"("lineage_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "repro_protocols_farm_id_id_key" ON "repro_protocols"("farm_id", "id");

-- CreateIndex
CREATE INDEX "breeding_events_female_id_date_idx" ON "breeding_events"("female_id", "date");

-- CreateIndex
CREATE INDEX "breeding_events_farm_id_date_idx" ON "breeding_events"("farm_id", "date");

-- CreateIndex
CREATE INDEX "pregnancy_checks_female_id_date_idx" ON "pregnancy_checks"("female_id", "date");

-- CreateIndex
CREATE INDEX "births_dam_id_date_idx" ON "births"("dam_id", "date");

-- CreateIndex
CREATE INDEX "births_farm_id_date_idx" ON "births"("farm_id", "date");

-- CreateIndex
CREATE INDEX "tasks_farm_id_status_due_on_idx" ON "tasks"("farm_id", "status", "due_on");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_farm_id_dedupe_key_key" ON "tasks"("farm_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "animals_farm_id_expected_calving_on_idx" ON "animals"("farm_id", "expected_calving_on");

-- AddForeignKey
ALTER TABLE "breeding_seasons" ADD CONSTRAINT "breeding_seasons_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repro_protocols" ADD CONSTRAINT "repro_protocols_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_executions" ADD CONSTRAINT "protocol_executions_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_executions" ADD CONSTRAINT "protocol_executions_farm_id_protocol_id_fkey" FOREIGN KEY ("farm_id", "protocol_id") REFERENCES "repro_protocols"("farm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeding_events" ADD CONSTRAINT "breeding_events_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeding_events" ADD CONSTRAINT "breeding_events_organization_id_female_id_fkey" FOREIGN KEY ("organization_id", "female_id") REFERENCES "animals"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeding_events" ADD CONSTRAINT "breeding_events_organization_id_sire_id_fkey" FOREIGN KEY ("organization_id", "sire_id") REFERENCES "animals"("organization_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "breeding_events" ADD CONSTRAINT "breeding_events_farm_id_season_id_fkey" FOREIGN KEY ("farm_id", "season_id") REFERENCES "breeding_seasons"("farm_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "breeding_events" ADD CONSTRAINT "breeding_events_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "protocol_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pregnancy_checks" ADD CONSTRAINT "pregnancy_checks_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pregnancy_checks" ADD CONSTRAINT "pregnancy_checks_organization_id_female_id_fkey" FOREIGN KEY ("organization_id", "female_id") REFERENCES "animals"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pregnancy_checks" ADD CONSTRAINT "pregnancy_checks_farm_id_season_id_fkey" FOREIGN KEY ("farm_id", "season_id") REFERENCES "breeding_seasons"("farm_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "births" ADD CONSTRAINT "births_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "births" ADD CONSTRAINT "births_organization_id_dam_id_fkey" FOREIGN KEY ("organization_id", "dam_id") REFERENCES "animals"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birth_calves" ADD CONSTRAINT "birth_calves_birth_id_fkey" FOREIGN KEY ("birth_id") REFERENCES "births"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birth_calves" ADD CONSTRAINT "birth_calves_organization_id_animal_id_fkey" FOREIGN KEY ("organization_id", "animal_id") REFERENCES "animals"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "breeding_events"
  ADD CONSTRAINT "breeding_events_end_after_start_chk" CHECK ("end_date" IS NULL OR "end_date" >= "date"),
  ADD CONSTRAINT "breeding_events_not_self_chk" CHECK ("sire_id" IS DISTINCT FROM "female_id");
ALTER TABLE "pregnancy_checks"
  ADD CONSTRAINT "pregnancy_checks_gestation_chk" CHECK ("estimated_gestation_days" IS NULL OR "estimated_gestation_days" BETWEEN 1 AND 300);
ALTER TABLE "breeding_seasons"
  ADD CONSTRAINT "breeding_seasons_dates_chk" CHECK ("end_date" >= "start_date");
ALTER TABLE "birth_calves"
  ADD CONSTRAINT "birth_calves_stillborn_chk" CHECK (("stillborn" AND "animal_id" IS NULL) OR (NOT "stillborn" AND "animal_id" IS NOT NULL));
