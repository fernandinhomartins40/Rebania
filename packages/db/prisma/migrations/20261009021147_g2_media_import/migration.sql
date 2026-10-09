-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('uploading', 'processing', 'ready', 'failed');

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "animal_id" UUID,
    "event_id" UUID,
    "kind" TEXT NOT NULL DEFAULT 'photo',
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploaded_bytes" INTEGER NOT NULL DEFAULT 0,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'uploading',
    "width" INTEGER,
    "height" INTEGER,
    "caption" TEXT,
    "taken_on" DATE,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "failure_reason" TEXT,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "accepted_rows" INTEGER NOT NULL,
    "rejected_rows" INTEGER NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachments_animal_id_created_at_idx" ON "attachments"("animal_id", "created_at");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_animal_id_fkey" FOREIGN KEY ("organization_id", "animal_id") REFERENCES "animals"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_organization_id_farm_id_fkey" FOREIGN KEY ("organization_id", "farm_id") REFERENCES "farms"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attachments"
  ADD CONSTRAINT "attachments_size_chk" CHECK ("size_bytes" > 0 AND "uploaded_bytes" >= 0 AND "uploaded_bytes" <= "size_bytes"),
  ADD CONSTRAINT "attachments_sha256_chk" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
