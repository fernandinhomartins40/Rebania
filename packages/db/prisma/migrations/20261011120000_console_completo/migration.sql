-- CreateEnum
CREATE TYPE "OrgStage" AS ENUM ('lead', 'onboarding', 'active', 'suspended', 'churned');

-- CreateEnum
CREATE TYPE "OrgAccess" AS ENUM ('full', 'read_only');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('admin', 'finance', 'support', 'onboarding');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('implementation', 'monthly', 'credits', 'other');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('todo', 'doing', 'done', 'skipped');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('queued', 'sent', 'delivered', 'failed', 'bounced', 'skipped');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('open', 'waiting_customer', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "TicketChannel" AS ENUM ('app', 'whatsapp', 'email', 'phone', 'other');

-- CreateEnum
CREATE TYPE "MessageAuthor" AS ENUM ('customer', 'staff', 'system');

-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('pending', 'approved', 'denied', 'cancelled');

-- CreateEnum
CREATE TYPE "AnnouncementLevel" AS ENUM ('info', 'warning', 'maintenance');

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "billing_day" INTEGER,
ADD COLUMN     "limits" JSONB,
ADD COLUMN     "plan_id" UUID;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "kind" "InvoiceKind" NOT NULL DEFAULT 'other',
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "payment_url" TEXT,
ADD COLUMN     "reference" TEXT;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "access_changed_at" TIMESTAMPTZ(3),
ADD COLUMN     "access_mode" "OrgAccess" NOT NULL DEFAULT 'full',
ADD COLUMN     "access_reason" TEXT,
ADD COLUMN     "account_manager_id" UUID,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "document" TEXT,
ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "stage" "OrgStage" NOT NULL DEFAULT 'onboarding',
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "platform_admins" ADD COLUMN     "mfa_enabled_at" TIMESTAMPTZ(3),
ADD COLUMN     "mfa_secret_enc" TEXT,
ADD COLUMN     "role" "PlatformRole" NOT NULL DEFAULT 'admin';

-- CreateTable
CREATE TABLE "org_contacts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "billing" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "org_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_notes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "onboarding_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_steps" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'todo',
    "assignee_user_id" UUID,
    "due_on" DATE,
    "done_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "onboarding_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "implementation_cents" BIGINT,
    "monthly_cents" BIGINT,
    "limits" JSONB NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_amendments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "monthly_cents" BIGINT,
    "limits" JSONB,
    "effective_on" DATE NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_reminders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "email_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "to_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'queued',
    "provider_message_id" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "platform_secrets" (
    "key" TEXT NOT NULL,
    "value_enc" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_secrets_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "requested_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'open',
    "priority" "TicketPriority" NOT NULL DEFAULT 'normal',
    "channel" "TicketChannel" NOT NULL DEFAULT 'app',
    "farm_id" UUID,
    "opened_by_user_id" UUID,
    "assignee_user_id" UUID,
    "first_response_due_at" TIMESTAMPTZ(3) NOT NULL,
    "resolution_due_at" TIMESTAMPTZ(3) NOT NULL,
    "first_responded_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_user_id" UUID,
    "author_kind" "MessageAuthor" NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "channel" "TicketChannel",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_access_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "platform_user_id" UUID NOT NULL,
    "ticket_id" UUID,
    "reason" TEXT NOT NULL,
    "hours" INTEGER NOT NULL,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'pending',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "grant_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "level" "AnnouncementLevel" NOT NULL DEFAULT 'info',
    "organization_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_contacts_organization_id_idx" ON "org_contacts"("organization_id");

-- CreateIndex
CREATE INDEX "org_notes_organization_id_created_at_idx" ON "org_notes"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "onboarding_steps_organization_id_position_idx" ON "onboarding_steps"("organization_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_version_key" ON "plans"("code", "version");

-- CreateIndex
CREATE INDEX "contract_amendments_contract_id_idx" ON "contract_amendments"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_reminders_invoice_id_stage_key" ON "invoice_reminders"("invoice_id", "stage");

-- CreateIndex
CREATE INDEX "email_messages_status_created_at_idx" ON "email_messages"("status", "created_at");

-- CreateIndex
CREATE INDEX "email_messages_organization_id_created_at_idx" ON "email_messages"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "email_messages_provider_message_id_idx" ON "email_messages"("provider_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_number_key" ON "support_tickets"("number");

-- CreateIndex
CREATE INDEX "support_tickets_status_priority_idx" ON "support_tickets"("status", "priority");

-- CreateIndex
CREATE INDEX "support_tickets_organization_id_created_at_idx" ON "support_tickets"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_organization_id_id_key" ON "support_tickets"("organization_id", "id");

-- CreateIndex
CREATE INDEX "support_messages_ticket_id_created_at_idx" ON "support_messages"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "support_access_requests_organization_id_status_idx" ON "support_access_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "announcements_starts_at_idx" ON "announcements"("starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_organization_id_id_key" ON "contracts"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organization_id_id_key" ON "invoices"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_contract_id_kind_reference_key" ON "invoices"("contract_id", "kind", "reference");

-- AddForeignKey
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_contacts" ADD CONSTRAINT "org_contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_notes" ADD CONSTRAINT "org_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_amendments" ADD CONSTRAINT "contract_amendments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_amendments" ADD CONSTRAINT "contract_amendments_organization_id_contract_id_fkey" FOREIGN KEY ("organization_id", "contract_id") REFERENCES "contracts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_organization_id_invoice_id_fkey" FOREIGN KEY ("organization_id", "invoice_id") REFERENCES "invoices"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_organization_id_ticket_id_fkey" FOREIGN KEY ("organization_id", "ticket_id") REFERENCES "support_tickets"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_access_requests" ADD CONSTRAINT "support_access_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_access_requests" ADD CONSTRAINT "support_access_requests_organization_id_ticket_id_fkey" FOREIGN KEY ("organization_id", "ticket_id") REFERENCES "support_tickets"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Dados: clientes que já existiam estão em operação (o padrão "onboarding" vale para novos).
UPDATE "organizations" SET "stage" = 'active';
UPDATE "organizations" SET "is_demo" = true WHERE "slug" = 'rebania-demo';

-- Dia de vencimento válido em qualquer mês.
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_billing_day_check" CHECK ("billing_day" IS NULL OR "billing_day" BETWEEN 1 AND 28);

-- Notas internas e mensagens de chamado são histórico: correção = nova nota/mensagem.
CREATE FUNCTION "console_history_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% é append-only', TG_TABLE_NAME;
END;
$$;
CREATE TRIGGER "org_notes_no_update" BEFORE UPDATE OR DELETE ON "org_notes"
  FOR EACH ROW EXECUTE FUNCTION "console_history_append_only"();
CREATE TRIGGER "support_messages_no_update" BEFORE UPDATE OR DELETE ON "support_messages"
  FOR EACH ROW EXECUTE FUNCTION "console_history_append_only"();

-- Sessão da conta da plataforma: verificação em duas etapas confirmada.
ALTER TABLE "auth_sessions" ADD COLUMN "mfa_verified_at" TIMESTAMPTZ(3);
