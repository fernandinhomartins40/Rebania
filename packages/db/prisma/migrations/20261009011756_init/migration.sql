-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'manager', 'field', 'veterinarian', 'finance');

-- CreateEnum
CREATE TYPE "SessionChannel" AS ENUM ('web', 'mobile');

-- CreateEnum
CREATE TYPE "AnimalSex" AS ENUM ('female', 'male');

-- CreateEnum
CREATE TYPE "AnimalCategory" AS ENUM ('calf_female', 'calf_male', 'heifer', 'steer', 'cow', 'bull', 'ox');

-- CreateEnum
CREATE TYPE "AnimalStatus" AS ENUM ('active', 'sold', 'dead', 'culled', 'transferred_out');

-- CreateEnum
CREATE TYPE "AnimalOrigin" AS ENUM ('born_on_farm', 'purchased', 'transferred_in', 'unknown');

-- CreateEnum
CREATE TYPE "IdentifierType" AS ENUM ('visual_tag', 'rfid', 'nfc', 'qr', 'provisional', 'other');

-- CreateEnum
CREATE TYPE "IdentifierStatus" AS ENUM ('active', 'retired');

-- CreateEnum
CREATE TYPE "WeightSource" AS ENUM ('manual', 'scale', 'import');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'done', 'failed');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farms" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "farms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "all_farms" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_farms" (
    "membership_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,

    CONSTRAINT "membership_farms_pkey" PRIMARY KEY ("membership_id","farm_id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "all_farms" BOOLEAN NOT NULL DEFAULT false,
    "farm_ids" UUID[],
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "invited_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "SessionChannel" NOT NULL,
    "access_hash" TEXT NOT NULL,
    "access_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "refresh_hash" TEXT,
    "refresh_expires_at" TIMESTAMPTZ(3),
    "device_label" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" TEXT,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "farm_id" UUID,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pastures" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "pastures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "sex" "AnimalSex" NOT NULL,
    "category" "AnimalCategory" NOT NULL,
    "status" "AnimalStatus" NOT NULL DEFAULT 'active',
    "breed" TEXT,
    "birth_date" DATE,
    "birth_date_estimated" BOOLEAN NOT NULL DEFAULT false,
    "origin" "AnimalOrigin" NOT NULL,
    "entry_date" DATE,
    "group_id" UUID,
    "pasture_id" UUID,
    "dam_id" UUID,
    "sire_id" UUID,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "animals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animal_identifiers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "type" "IdentifierType" NOT NULL,
    "raw_value" TEXT NOT NULL,
    "normalized_value" TEXT NOT NULL,
    "status" "IdentifierStatus" NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retired_at" TIMESTAMPTZ(3),
    "retired_reason" TEXT,

    CONSTRAINT "animal_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weight_measurements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "weight_kg" DECIMAL(7,2) NOT NULL,
    "measured_on" DATE NOT NULL,
    "source" "WeightSource" NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(3),

    CONSTRAINT "weight_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animal_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "occurred_on" DATE NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "corrects_event_id" UUID,
    "source_mutation_id" UUID,
    "actor_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "animal_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_mutations" (
    "mutation_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "device_id" UUID,
    "actor_user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "entity_id" UUID,
    "request_hash" TEXT NOT NULL,
    "receipt" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_mutations_pkey" PRIMARY KEY ("mutation_id")
);

-- CreateTable
CREATE TABLE "change_log" (
    "seq" BIGSERIAL NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "op" TEXT NOT NULL DEFAULT 'upsert',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_log_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "queue" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "run_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "locked_at" TIMESTAMPTZ(3),
    "locked_by" TEXT,
    "last_error" TEXT,
    "dedupe_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "farms_organization_id_id_key" ON "farms"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organization_id_user_id_key" ON "memberships"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organization_id_id_key" ON "memberships"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_organization_id_email_idx" ON "invitations"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_access_hash_key" ON "auth_sessions"("access_hash");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_hash_key" ON "auth_sessions"("refresh_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "audit_entries_organization_id_created_at_idx" ON "audit_entries"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_entries_entity_type_entity_id_idx" ON "audit_entries"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "groups_farm_id_id_key" ON "groups"("farm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pastures_farm_id_id_key" ON "pastures"("farm_id", "id");

-- CreateIndex
CREATE INDEX "animals_farm_id_status_idx" ON "animals"("farm_id", "status");

-- CreateIndex
CREATE INDEX "animals_farm_id_group_id_idx" ON "animals"("farm_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "animals_organization_id_id_key" ON "animals"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "animals_farm_id_id_key" ON "animals"("farm_id", "id");

-- CreateIndex
CREATE INDEX "animal_identifiers_farm_id_normalized_value_idx" ON "animal_identifiers"("farm_id", "normalized_value");

-- CreateIndex
CREATE INDEX "animal_identifiers_organization_id_normalized_value_idx" ON "animal_identifiers"("organization_id", "normalized_value");

-- CreateIndex
CREATE INDEX "animal_identifiers_animal_id_idx" ON "animal_identifiers"("animal_id");

-- CreateIndex
CREATE INDEX "weight_measurements_animal_id_measured_on_idx" ON "weight_measurements"("animal_id", "measured_on");

-- CreateIndex
CREATE INDEX "weight_measurements_farm_id_measured_on_idx" ON "weight_measurements"("farm_id", "measured_on");

-- CreateIndex
CREATE INDEX "animal_events_animal_id_occurred_on_idx" ON "animal_events"("animal_id", "occurred_on");

-- CreateIndex
CREATE INDEX "sync_mutations_organization_id_created_at_idx" ON "sync_mutations"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "change_log_farm_id_seq_idx" ON "change_log"("farm_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_dedupe_key_key" ON "jobs"("dedupe_key");

-- CreateIndex
CREATE INDEX "jobs_status_queue_run_at_idx" ON "jobs"("status", "queue", "run_at");

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_farms" ADD CONSTRAINT "membership_farms_organization_id_membership_id_fkey" FOREIGN KEY ("organization_id", "membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_farms" ADD CONSTRAINT "membership_farms_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastures" ADD CONSTRAINT "pastures_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_farm_id_group_id_fkey" FOREIGN KEY ("farm_id", "group_id") REFERENCES "groups"("farm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_farm_id_pasture_id_fkey" FOREIGN KEY ("farm_id", "pasture_id") REFERENCES "pastures"("farm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_organization_id_dam_id_fkey" FOREIGN KEY ("organization_id", "dam_id") REFERENCES "animals"("organization_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_organization_id_sire_id_fkey" FOREIGN KEY ("organization_id", "sire_id") REFERENCES "animals"("organization_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "animal_identifiers" ADD CONSTRAINT "animal_identifiers_farm_id_animal_id_fkey" FOREIGN KEY ("farm_id", "animal_id") REFERENCES "animals"("farm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_identifiers" ADD CONSTRAINT "animal_identifiers_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_measurements" ADD CONSTRAINT "weight_measurements_organization_id_animal_id_fkey" FOREIGN KEY ("organization_id", "animal_id") REFERENCES "animals"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_measurements" ADD CONSTRAINT "weight_measurements_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_events" ADD CONSTRAINT "animal_events_organization_id_animal_id_fkey" FOREIGN KEY ("organization_id", "animal_id") REFERENCES "animals"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_events" ADD CONSTRAINT "animal_events_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_log" ADD CONSTRAINT "change_log_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Regras que o Prisma não expressa (ADR-002). Índices parciais, CHECKs e
-- triggers não são gerenciados pelo Prisma e sobrevivem a migrações futuras.
-- As FKs compostas de tenant estão declaradas no schema.prisma.
-- ============================================================================

ALTER TABLE "animals"
  ADD CONSTRAINT "animals_not_own_parent_chk" CHECK ("dam_id" IS DISTINCT FROM "id" AND "sire_id" IS DISTINCT FROM "id"),
  ADD CONSTRAINT "animals_version_positive_chk" CHECK ("version" >= 1);

ALTER TABLE "animal_identifiers"
  ADD CONSTRAINT "animal_identifiers_retired_chk" CHECK (("status" = 'retired') = ("retired_at" IS NOT NULL));

-- Unicidade de identificadores ATIVOS:
--  brinco visual / provisório / outro: por fazenda;  RFID / NFC / QR: por organização.
CREATE UNIQUE INDEX "animal_identifiers_active_farm_uniq"
  ON "animal_identifiers" ("farm_id", "type", "normalized_value")
  WHERE "status" = 'active' AND "type" IN ('visual_tag', 'provisional', 'other');
CREATE UNIQUE INDEX "animal_identifiers_active_org_uniq"
  ON "animal_identifiers" ("organization_id", "type", "normalized_value")
  WHERE "status" = 'active' AND "type" IN ('rfid', 'nfc', 'qr');

ALTER TABLE "weight_measurements"
  ADD CONSTRAINT "weight_measurements_positive_chk" CHECK ("weight_kg" > 0);

-- Auditoria é append-only.
CREATE FUNCTION "audit_entries_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_entries é append-only';
END;
$$;
CREATE TRIGGER "audit_entries_no_update" BEFORE UPDATE OR DELETE ON "audit_entries"
  FOR EACH ROW EXECUTE FUNCTION "audit_entries_append_only"();

-- E-mails sempre normalizados em minúsculas.
ALTER TABLE "users" ADD CONSTRAINT "users_email_lower_chk" CHECK ("email" = lower("email"));
