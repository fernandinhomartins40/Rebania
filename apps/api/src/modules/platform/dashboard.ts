import { ORG_STAGES } from "@rebania/domain";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../lib/context.ts";
import { civilToDate, dateToCivil } from "../../lib/dates.ts";
import { requireStaff } from "../../lib/staff.ts";
import { computeAlerts } from "./ops.ts";
import { contractTerms, today } from "./shared.ts";

/** Visão geral do console: clientes, dinheiro, implantação, suporte, uso e alertas. */
export function dashboardRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  app.get("/v1/platform/overview", async (req) => {
    await requireStaff(ctx, req, "customers.read");
    const now = ctx.now();
    const t = today(ctx);
    const monthStart = civilToDate(`${t.slice(0, 7)}-01`);
    const d7 = new Date(now.getTime() - 7 * 86_400_000);
    const d30 = new Date(now.getTime() - 30 * 86_400_000);
    const real = { isDemo: false };
    const demoIds = (
      await db.organization.findMany({ where: { isDemo: true }, select: { id: true } })
    ).map((o) => o.id);
    const [
      stages,
      newThisMonth,
      churnedThisMonth,
      contracts,
      open,
      paidThisMonth,
      onboardingSteps,
      tickets,
      activeUsers,
      ai,
      alerts,
    ] = await Promise.all([
      db.organization.groupBy({ by: ["stage"], where: real, _count: { _all: true } }),
      db.organization.count({ where: { ...real, createdAt: { gte: monthStart } } }),
      db.auditEntry.count({
        where: {
          action: "customer.stage",
          createdAt: { gte: monthStart },
          data: { path: ["to"], equals: "churned" },
        },
      }),
      db.contract.findMany({
        where: { status: "active", organization: real },
        include: { amendments: true },
      }),
      db.invoice.findMany({
        where: { status: { in: ["pending", "failed"] }, organization: real },
        select: { amountCents: true, dueOn: true },
      }),
      db.invoice.aggregate({
        where: { status: "paid", paidAt: { gte: monthStart }, organization: real },
        _sum: { amountCents: true },
      }),
      db.onboardingStep.findMany({
        where: { status: { in: ["todo", "doing"] }, organization: real },
        select: { organizationId: true, dueOn: true },
      }),
      db.supportTicket.findMany({
        where: { status: { in: ["open", "waiting_customer"] } },
        select: {
          status: true,
          assigneeUserId: true,
          firstRespondedAt: true,
          firstResponseDueAt: true,
          resolutionDueAt: true,
        },
      }),
      db.authSession.findMany({
        where: {
          lastUsedAt: { gte: d7 },
          user: {
            platformAdmin: null,
            memberships: { some: { revokedAt: null, organization: real } },
          },
        },
        distinct: ["userId"],
        select: { userId: true },
      }),
      db.aiUsage.aggregate({
        where: { createdAt: { gte: d30 }, status: "ok", organizationId: { notIn: demoIds } },
        _count: { _all: true },
        _sum: { credits: true },
      }),
      computeAlerts(ctx),
    ]);
    const overdue = open.filter((i) => dateToCivil(i.dueOn) < t);
    return {
      customers: {
        byStage: Object.fromEntries(
          ORG_STAGES.map((s) => [s, stages.find((x) => x.stage === s)?._count._all ?? 0]),
        ),
        newThisMonth,
        churnedThisMonth,
      },
      finance: {
        mrrCents: contracts.reduce((a, c) => a + (contractTerms(c, t).monthlyCents ?? 0), 0),
        receivableCents: open
          .filter((i) => dateToCivil(i.dueOn) >= t)
          .reduce((a, i) => a + Number(i.amountCents), 0),
        overdueCents: overdue.reduce((a, i) => a + Number(i.amountCents), 0),
        overdueCount: overdue.length,
        receivedThisMonthCents: Number(paidThisMonth._sum.amountCents ?? 0),
      },
      onboarding: {
        customers: new Set(onboardingSteps.map((s) => s.organizationId)).size,
        overdueSteps: onboardingSteps.filter((s) => s.dueOn && dateToCivil(s.dueOn) < t).length,
      },
      support: {
        active: tickets.length,
        waitingTeam: tickets.filter((x) => x.status === "open").length,
        unassigned: tickets.filter((x) => !x.assigneeUserId).length,
        breached: tickets.filter(
          (x) => (!x.firstRespondedAt && x.firstResponseDueAt < now) || x.resolutionDueAt < now,
        ).length,
      },
      usage: {
        activeUsers7d: activeUsers.length,
        aiQuestions30d: ai._count._all,
        aiCredits30d: ai._sum.credits ?? 0,
      },
      alerts,
    };
  });
}
