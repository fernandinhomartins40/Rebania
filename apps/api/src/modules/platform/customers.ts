import {
  assertStageTransition,
  isValidTimezone,
  ORG_STAGES,
  PLATFORM_ROLE_PERMISSIONS,
  ROLE_LABEL,
} from "@rebania/domain";
import { queueEmail, refreshOrgAccess } from "@rebania/saas";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../../lib/audit.ts";
import type { AppContext } from "../../lib/context.ts";
import { randomToken, sha256 } from "../../lib/crypto.ts";
import { dateToCivil } from "../../lib/dates.ts";
import { HttpError, notFound } from "../../lib/errors.ts";
import { assertCanJoinOrganization } from "../../lib/platform-account.ts";
import { provisionOrganization } from "../../lib/provision.ts";
import { requireStaff } from "../../lib/staff.ts";
import { balanceOf } from "../../lib/credits.ts";
import {
  capacityFor,
  contractTerms,
  num,
  orgUsage,
  serializeInvoice,
  staffNames,
  today,
} from "./shared.ts";

const digits = (v: string) => v.replace(/\D+/g, "");

const Profile = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  document: z
    .string()
    .trim()
    .max(20)
    .transform(digits)
    .refine((d) => d === "" || d.length === 11 || d.length === 14, "CPF (11) ou CNPJ (14) dígitos.")
    .nullable()
    .optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  state: z
    .string()
    .trim()
    .length(2)
    .transform((s) => s.toUpperCase())
    .nullable()
    .optional(),
  accountManagerId: z.uuid().nullable().optional(),
});

async function assertStaffUser(ctx: AppContext, userId: string | null | undefined) {
  if (!userId) return;
  const s = await ctx.db.platformAdmin.findUnique({ where: { userId } });
  if (!s) throw new HttpError(422, "invalid_staff", "Responsável precisa ser da equipe Rebania.");
}

export function customerRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config } = ctx;

  app.get("/v1/platform/customers", async (req) => {
    await requireStaff(ctx, req, "customers.read");
    const q = z
      .object({
        search: z.string().trim().max(120).optional(),
        stage: z.enum(ORG_STAGES).optional(),
        access: z.enum(["full", "read_only"]).optional(),
        manager: z.uuid().optional(),
        demo: z.enum(["include", "only", "exclude"]).default("exclude"),
      })
      .parse(req.query);
    const digitsSearch = q.search ? digits(q.search) : "";
    const orgs = await db.organization.findMany({
      where: {
        ...(q.stage ? { stage: q.stage } : {}),
        ...(q.access ? { accessMode: q.access } : {}),
        ...(q.manager ? { accountManagerId: q.manager } : {}),
        ...(q.demo === "exclude" ? { isDemo: false } : q.demo === "only" ? { isDemo: true } : {}),
        ...(q.search
          ? {
              OR: [
                { name: { contains: q.search, mode: "insensitive" as const } },
                ...(digitsSearch.length >= 3 ? [{ document: { contains: digitsSearch } }] : []),
                { city: { contains: q.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        farms: { where: { archivedAt: null }, select: { id: true } },
        contracts: {
          where: { status: { in: ["active", "suspended"] } },
          take: 1,
          orderBy: { createdAt: "desc" },
          include: { amendments: true },
        },
        credit: true,
        _count: { select: { memberships: { where: { revokedAt: null } } } },
      },
      take: 500,
    });
    const ids = orgs.map((o) => o.id);
    const t = today(ctx);
    const [animals, usage, openInvoices, steps, tickets, managers] = await Promise.all([
      db.animal.groupBy({
        by: ["organizationId"],
        where: { organizationId: { in: ids }, status: "active" },
        _count: { _all: true },
      }),
      db.aiUsage.groupBy({
        by: ["organizationId"],
        where: {
          organizationId: { in: ids },
          createdAt: { gte: new Date(ctx.now().getTime() - 30 * 86_400_000) },
          status: "ok",
        },
        _count: { _all: true },
      }),
      db.invoice.findMany({
        where: { organizationId: { in: ids }, status: { in: ["pending", "failed"] } },
        select: { organizationId: true, amountCents: true, dueOn: true },
      }),
      db.onboardingStep.groupBy({
        by: ["organizationId", "status"],
        where: { organizationId: { in: ids } },
        _count: { _all: true },
      }),
      db.supportTicket.groupBy({
        by: ["organizationId"],
        where: { organizationId: { in: ids }, status: { in: ["open", "waiting_customer"] } },
        _count: { _all: true },
      }),
      staffNames(
        db,
        orgs.map((o) => o.accountManagerId),
      ),
    ]);
    return {
      items: orgs.map((o) => {
        const open = openInvoices.filter((i) => i.organizationId === o.id);
        const overdue = open.filter((i) => dateToCivil(i.dueOn) < t);
        const st = steps.filter((s) => s.organizationId === o.id);
        const total = st.reduce((a, s) => a + s._count._all, 0);
        const done = st
          .filter((s) => s.status === "done" || s.status === "skipped")
          .reduce((a, s) => a + s._count._all, 0);
        const c = o.contracts[0];
        return {
          id: o.id,
          name: o.name,
          stage: o.stage,
          accessMode: o.accessMode,
          isDemo: o.isDemo,
          city: o.city,
          state: o.state,
          createdAt: o.createdAt.toISOString(),
          accountManager: o.accountManagerId
            ? { id: o.accountManagerId, name: managers.get(o.accountManagerId) ?? "" }
            : null,
          farms: o.farms.length,
          members: o._count.memberships,
          activeAnimals: animals.find((a) => a.organizationId === o.id)?._count._all ?? 0,
          contract: c
            ? {
                id: c.id,
                plan: c.plan,
                status: c.status,
                monthlyCents: contractTerms(c, t).monthlyCents,
              }
            : null,
          openCents: open.reduce((a, i) => a + Number(i.amountCents), 0),
          overdueCents: overdue.reduce((a, i) => a + Number(i.amountCents), 0),
          credits: o.credit?.balance ?? 0,
          aiQuestions30d: usage.find((u) => u.organizationId === o.id)?._count._all ?? 0,
          onboarding: total ? { done, total } : null,
          openTickets: tickets.find((x) => x.organizationId === o.id)?._count._all ?? 0,
        };
      }),
    };
  });

  /** T03 Implantação: organização + fazenda + convite do proprietário (+ checklist do modelo). */
  app.post("/v1/platform/customers", async (req, reply) => {
    const staff = await requireStaff(ctx, req, "customers.write");
    const body = Profile.extend({
      orgName: z.string().trim().min(2).max(120),
      farmName: z.string().trim().min(2).max(120),
      timezone: z.string().default("America/Sao_Paulo"),
      ownerEmail: z.email(),
      ownerName: z.string().trim().max(120).optional(),
      stage: z.enum(["lead", "onboarding"]).default("onboarding"),
      templateId: z.uuid().optional(),
    }).parse(req.body);
    if (!isValidTimezone(body.timezone))
      throw new HttpError(422, "invalid_timezone", "Fuso inválido.");
    await assertStaffUser(ctx, body.accountManagerId);
    const template = body.templateId
      ? await db.onboardingTemplate.findFirst({ where: { id: body.templateId, archivedAt: null } })
      : null;
    if (body.templateId && !template) throw notFound("Modelo de implantação");
    const r = await db.$transaction(async (tx) => {
      const p = await provisionOrganization(tx, {
        orgName: body.orgName,
        farmName: body.farmName,
        timezone: body.timezone,
        ownerEmail: body.ownerEmail,
        invitationTtlMs: config.invitationTtlMs,
        now: ctx.now(),
        actorUserId: staff.userId,
      });
      await tx.organization.update({
        where: { id: p.org.id },
        data: {
          stage: body.stage,
          document: body.document || null,
          phone: body.phone ?? null,
          city: body.city ?? null,
          state: body.state ?? null,
          accountManagerId: body.accountManagerId ?? null,
        },
      });
      if (body.ownerName)
        await tx.orgContact.create({
          data: {
            organizationId: p.org.id,
            name: body.ownerName,
            email: body.ownerEmail,
            role: "Proprietário",
          },
        });
      const steps =
        (template?.steps as { title: string; description?: string }[] | undefined) ?? [];
      if (steps.length)
        await tx.onboardingStep.createMany({
          data: steps.map((s, i) => ({
            organizationId: p.org.id,
            title: s.title,
            description: s.description ?? null,
            position: i,
            assigneeUserId: body.accountManagerId ?? null,
          })),
        });
      const acceptUrl = `${config.webBaseUrl}/convite#token=${p.token}`;
      const emailId = await queueEmail(tx, {
        to: body.ownerEmail,
        template: "invitation",
        baseUrl: config.webBaseUrl,
        organizationId: p.org.id,
        data: {
          organizationName: body.orgName,
          roleLabel: ROLE_LABEL.owner,
          url: acceptUrl,
          expiresOn: dateToCivil(p.inv.expiresAt),
        },
      });
      const email = emailId ? await tx.emailMessage.findUnique({ where: { id: emailId } }) : null;
      return { ...p, acceptUrl, emailQueued: email?.status === "queued" };
    });
    return reply.status(201).send({
      organizationId: r.org.id,
      farmId: r.farm.id,
      acceptUrl: r.acceptUrl,
      expiresAt: r.inv.expiresAt.toISOString(),
      emailQueued: r.emailQueued,
    });
  });

  /** Ficha 360 do cliente. Nenhum dado do rebanho além de contagens. */
  app.get<{ Params: { id: string } }>("/v1/platform/customers/:id", async (req) => {
    const staff = await requireStaff(ctx, req, "customers.read");
    const o = await db.organization.findUnique({
      where: { id: req.params.id },
      include: {
        farms: {
          select: { id: true, name: true, timezone: true, archivedAt: true, createdAt: true },
        },
        contracts: {
          orderBy: { createdAt: "desc" },
          include: { amendments: { orderBy: { effectiveOn: "desc" } }, catalogPlan: true },
        },
        invoices: { orderBy: { dueOn: "desc" }, take: 60 },
        creditOrders: { orderBy: { createdAt: "desc" }, take: 30 },
        supportGrants: { orderBy: { createdAt: "desc" }, take: 20 },
        accessRequests: { orderBy: { createdAt: "desc" }, take: 20 },
        contacts: { where: { archivedAt: null }, orderBy: { createdAt: "asc" } },
        invitations: {
          where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: ctx.now() } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!o) throw notFound("Cliente");
    const t = today(ctx);
    const canCredits = PLATFORM_ROLE_PERMISSIONS[staff.role].includes("credits.manage");
    const [usage, ledger, balance, steps, tickets, lastActivity] = await Promise.all([
      orgUsage(db, o.id),
      canCredits
        ? db.creditLedger.findMany({
            where: { organizationId: o.id },
            orderBy: { createdAt: "desc" },
            take: 100,
          })
        : Promise.resolve([]),
      balanceOf(db, o.id),
      db.onboardingStep.findMany({ where: { organizationId: o.id }, orderBy: { position: "asc" } }),
      db.supportTicket.findMany({
        where: { organizationId: o.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          number: true,
          subject: true,
          status: true,
          priority: true,
          createdAt: true,
        },
      }),
      db.authSession.findFirst({
        where: { user: { memberships: { some: { organizationId: o.id, revokedAt: null } } } },
        orderBy: { lastUsedAt: "desc" },
        select: { lastUsedAt: true },
      }),
    ]);
    const active = o.contracts.find((c) => c.status === "active" || c.status === "suspended");
    const names = await staffNames(db, [
      o.accountManagerId,
      ...steps.map((s) => s.assigneeUserId),
      ...o.supportGrants.map((g) => g.platformUserId),
      ...o.accessRequests.map((r) => r.platformUserId),
    ]);
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      stage: o.stage,
      accessMode: o.accessMode,
      accessReason: o.accessReason,
      accessChangedAt: o.accessChangedAt?.toISOString() ?? null,
      isDemo: o.isDemo,
      document: o.document,
      phone: o.phone,
      city: o.city,
      state: o.state,
      createdAt: o.createdAt.toISOString(),
      lastActivityAt: lastActivity?.lastUsedAt.toISOString() ?? null,
      accountManager: o.accountManagerId
        ? { id: o.accountManagerId, name: names.get(o.accountManagerId) ?? "" }
        : null,
      farms: o.farms.map((f) => ({
        id: f.id,
        name: f.name,
        timezone: f.timezone,
        archived: f.archivedAt !== null,
        createdAt: f.createdAt.toISOString(),
      })),
      usage,
      capacity: capacityFor(active ? contractTerms(active, t).limits : null, usage),
      currentMonthlyCents: active ? contractTerms(active, t).monthlyCents : null,
      contracts: o.contracts.map((c) => ({
        id: c.id,
        plan: c.plan,
        planId: c.planId,
        planVersion: c.catalogPlan?.version ?? null,
        status: c.status,
        implementationCents: num(c.implementationCents),
        monthlyCents: num(c.monthlyCents),
        startsOn: dateToCivil(c.startsOn),
        endsOn: dateToCivil(c.endsOn),
        billingDay: c.billingDay,
        limits: c.limits,
        notes: c.notes,
        amendments: c.amendments.map((a) => ({
          id: a.id,
          description: a.description,
          monthlyCents: num(a.monthlyCents),
          limits: a.limits,
          effectiveOn: dateToCivil(a.effectiveOn),
          createdAt: a.createdAt.toISOString(),
        })),
      })),
      invoices: o.invoices.map((i) => serializeInvoice(i, t)),
      credits: {
        balance,
        ledger: ledger.map((l) => ({
          id: l.id,
          kind: l.kind,
          amount: l.amount,
          balanceAfter: l.balanceAfter,
          reservationId: l.reservationId,
          note: l.note,
          createdAt: l.createdAt.toISOString(),
        })),
        orders: o.creditOrders.map((x) => ({
          id: x.id,
          credits: x.credits,
          priceCents: Number(x.priceCents),
          status: x.status,
          createdAt: x.createdAt.toISOString(),
        })),
      },
      contacts: o.contacts.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        role: c.role,
        billing: c.billing,
      })),
      pendingInvitations: o.invitations.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt.toISOString(),
      })),
      onboarding: steps.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        position: s.position,
        status: s.status,
        assignee: s.assigneeUserId
          ? { id: s.assigneeUserId, name: names.get(s.assigneeUserId) ?? "" }
          : null,
        dueOn: dateToCivil(s.dueOn),
        doneAt: s.doneAt?.toISOString() ?? null,
      })),
      tickets: tickets.map((x) => ({ ...x, createdAt: x.createdAt.toISOString() })),
      supportGrants: o.supportGrants.map((g) => ({
        id: g.id,
        platformUserId: g.platformUserId,
        platformUserName: names.get(g.platformUserId) ?? "",
        reason: g.reason,
        expiresAt: g.expiresAt.toISOString(),
        active: !g.revokedAt && g.expiresAt > ctx.now(),
      })),
      accessRequests: o.accessRequests.map((r) => ({
        id: r.id,
        platformUserName: names.get(r.platformUserId) ?? "",
        reason: r.reason,
        hours: r.hours,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });

  app.patch<{ Params: { id: string } }>("/v1/platform/customers/:id", async (req) => {
    const staff = await requireStaff(ctx, req, "customers.write");
    const body = Profile.parse(req.body);
    const o = await db.organization.findUnique({ where: { id: req.params.id } });
    if (!o) throw notFound("Cliente");
    await assertStaffUser(ctx, body.accountManagerId);
    const data = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.document !== undefined ? { document: body.document || null } : {}),
      ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
      ...(body.city !== undefined ? { city: body.city || null } : {}),
      ...(body.state !== undefined ? { state: body.state || null } : {}),
      ...(body.accountManagerId !== undefined ? { accountManagerId: body.accountManagerId } : {}),
    };
    await db.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: o.id }, data });
      await audit(tx, {
        organizationId: o.id,
        actorUserId: staff.userId,
        action: "customer.update",
        entityType: "organization",
        entityId: o.id,
        data: Object.keys(data),
      });
    });
    return { ok: true };
  });

  /** Estágio do cliente; suspender/encerrar põe em somente leitura, reativar devolve. */
  app.post<{ Params: { id: string } }>("/v1/platform/customers/:id/stage", async (req) => {
    const staff = await requireStaff(ctx, req, "customers.write");
    const body = z
      .object({ stage: z.enum(ORG_STAGES), reason: z.string().trim().min(3).max(300) })
      .parse(req.body);
    const o = await db.organization.findUnique({ where: { id: req.params.id } });
    if (!o) throw notFound("Cliente");
    assertStageTransition(o.stage, body.stage);
    const mode = await db.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: o.id }, data: { stage: body.stage } });
      await audit(tx, {
        organizationId: o.id,
        actorUserId: staff.userId,
        action: "customer.stage",
        entityType: "organization",
        entityId: o.id,
        data: { from: o.stage, to: body.stage, reason: body.reason },
      });
      return refreshOrgAccess(tx, o.id, ctx.now(), config.webBaseUrl, staff.userId);
    });
    return { ok: true, accessMode: mode };
  });

  /** Novo convite do proprietário (o anterior, se pendente, é revogado). */
  app.post<{ Params: { id: string } }>(
    "/v1/platform/customers/:id/owner-invitation",
    async (req) => {
      const staff = await requireStaff(ctx, req, "customers.write");
      const { email } = z.object({ email: z.email() }).parse(req.body);
      const o = await db.organization.findUnique({ where: { id: req.params.id } });
      if (!o) throw notFound("Cliente");
      const token = randomToken();
      const r = await db.$transaction(async (tx) => {
        await assertCanJoinOrganization(tx, email);
        await tx.invitation.updateMany({
          where: { organizationId: o.id, role: "owner", acceptedAt: null, revokedAt: null },
          data: { revokedAt: ctx.now() },
        });
        const inv = await tx.invitation.create({
          data: {
            organizationId: o.id,
            email: email.trim().toLowerCase(),
            role: "owner",
            allFarms: true,
            tokenHash: sha256(token),
            expiresAt: new Date(ctx.now().getTime() + config.invitationTtlMs),
            invitedById: staff.userId,
          },
        });
        await audit(tx, {
          organizationId: o.id,
          actorUserId: staff.userId,
          action: "invitation.created",
          entityType: "invitation",
          entityId: inv.id,
          data: { role: "owner", via: "console" },
        });
        const acceptUrl = `${config.webBaseUrl}/convite#token=${token}`;
        const emailId = await queueEmail(tx, {
          to: email,
          template: "invitation",
          baseUrl: config.webBaseUrl,
          organizationId: o.id,
          data: {
            organizationName: o.name,
            roleLabel: ROLE_LABEL.owner,
            url: acceptUrl,
            expiresOn: dateToCivil(inv.expiresAt),
          },
        });
        const m = emailId ? await tx.emailMessage.findUnique({ where: { id: emailId } }) : null;
        return {
          acceptUrl,
          expiresAt: inv.expiresAt.toISOString(),
          emailQueued: m?.status === "queued",
        };
      });
      return r;
    },
  );

  // ---- Contatos ----
  const Contact = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.email().max(254).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    role: z.string().trim().max(60).nullable().optional(),
    billing: z.boolean().default(false),
  });

  app.post<{ Params: { id: string } }>(
    "/v1/platform/customers/:id/contacts",
    async (req, reply) => {
      const staff = await requireStaff(ctx, req, "customers.write");
      const body = Contact.parse(req.body);
      const o = await db.organization.findUnique({ where: { id: req.params.id } });
      if (!o) throw notFound("Cliente");
      const c = await db.orgContact.create({
        data: {
          organizationId: o.id,
          name: body.name,
          email: body.email?.toLowerCase() ?? null,
          phone: body.phone ?? null,
          role: body.role ?? null,
          billing: body.billing,
        },
      });
      await audit(db, {
        organizationId: o.id,
        actorUserId: staff.userId,
        action: "customer.contact_add",
        entityType: "org_contact",
        entityId: c.id,
      });
      return reply.status(201).send({ id: c.id });
    },
  );

  app.patch<{ Params: { id: string; contactId: string } }>(
    "/v1/platform/customers/:id/contacts/:contactId",
    async (req) => {
      const staff = await requireStaff(ctx, req, "customers.write");
      const body = Contact.partial().parse(req.body);
      const r = await db.orgContact.updateMany({
        where: { id: req.params.contactId, organizationId: req.params.id, archivedAt: null },
        data: { ...body, ...(body.email ? { email: body.email.toLowerCase() } : {}) },
      });
      if (!r.count) throw notFound("Contato");
      await audit(db, {
        organizationId: req.params.id,
        actorUserId: staff.userId,
        action: "customer.contact_update",
        entityType: "org_contact",
        entityId: req.params.contactId,
      });
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string; contactId: string } }>(
    "/v1/platform/customers/:id/contacts/:contactId/archive",
    async (req) => {
      const staff = await requireStaff(ctx, req, "customers.write");
      const r = await db.orgContact.updateMany({
        where: { id: req.params.contactId, organizationId: req.params.id, archivedAt: null },
        data: { archivedAt: ctx.now() },
      });
      if (!r.count) throw notFound("Contato");
      await audit(db, {
        organizationId: req.params.id,
        actorUserId: staff.userId,
        action: "customer.contact_archive",
        entityType: "org_contact",
        entityId: req.params.contactId,
      });
      return { ok: true };
    },
  );

  // ---- Notas internas (append-only) ----
  app.get<{ Params: { id: string } }>("/v1/platform/customers/:id/notes", async (req) => {
    await requireStaff(ctx, req, "customers.read");
    const notes = await db.orgNote.findMany({
      where: { organizationId: req.params.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const names = await staffNames(
      db,
      notes.map((n) => n.authorUserId),
    );
    return {
      items: notes.map((n) => ({
        id: n.id,
        body: n.body,
        author: names.get(n.authorUserId) ?? "",
        createdAt: n.createdAt.toISOString(),
      })),
    };
  });

  app.post<{ Params: { id: string } }>("/v1/platform/customers/:id/notes", async (req, reply) => {
    const staff = await requireStaff(ctx, req, "notes.write");
    const { body } = z.object({ body: z.string().trim().min(2).max(4000) }).parse(req.body);
    const o = await db.organization.findUnique({ where: { id: req.params.id } });
    if (!o) throw notFound("Cliente");
    const n = await db.orgNote.create({
      data: { organizationId: o.id, authorUserId: staff.userId, body },
    });
    return reply.status(201).send({ id: n.id });
  });

  /** Linha do tempo: auditoria do cliente (ações da equipe, do cliente e automáticas). */
  app.get<{ Params: { id: string } }>("/v1/platform/customers/:id/timeline", async (req) => {
    await requireStaff(ctx, req, "customers.read");
    const { before } = z.object({ before: z.iso.datetime().optional() }).parse(req.query);
    const rows = await db.auditEntry.findMany({
      where: {
        organizationId: req.params.id,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const actors = await db.user.findMany({
      where: {
        id: { in: [...new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x))] },
      },
      select: { id: true, name: true, platformAdmin: { select: { userId: true } } },
    });
    const byId = new Map(actors.map((a) => [a.id, a]));
    return {
      items: rows.map((r) => {
        const a = r.actorUserId ? byId.get(r.actorUserId) : undefined;
        return {
          id: r.id,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          data: r.data,
          actor: a ? { name: a.name, staff: Boolean(a.platformAdmin) } : null,
          createdAt: r.createdAt.toISOString(),
        };
      }),
    };
  });
}
