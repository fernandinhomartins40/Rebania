import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { deliverEmail, runBillingCycle, setSetting } from "@rebania/saas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { totpAt } from "../src/lib/totp.ts";
import {
  client,
  createStaff,
  createTenant,
  createTestEnv,
  createUser,
  sessionClient,
  newAnimal,
  PASSWORD,
  type Client,
  type Tenant,
  type TestEnv,
} from "./helpers.ts";

async function sessionFor(email: string) {
  const u = await env.db.user.findUniqueOrThrow({ where: { email } });
  return sessionClient(env, u.id);
}

/** Console com cofre configurado: verificação em duas etapas obrigatória para a equipe. */
const SECRETS_KEY = randomBytes(32).toString("base64");
let env: TestEnv;
let admin: Client;
let A: Tenant;
let ownerA: Client;
let fieldA: Client;

async function staffWithMfa(role: "admin" | "finance" | "support" | "onboarding") {
  const s = await createStaff(env.db);
  await env.db.platformAdmin.update({ where: { userId: s.id }, data: { role } });
  const c = await sessionFor(s.email);
  const setup = await c.post("/v1/platform/mfa/setup");
  expect(setup.statusCode).toBe(200);
  const code = totpAt(setup.json().secret, Math.floor(env.clock.now.getTime() / 30_000));
  expect((await c.post("/v1/platform/mfa/enable", { code })).statusCode).toBe(200);
  return { ...s, c, secret: setup.json().secret as string };
}

beforeAll(async () => {
  env = await createTestEnv({}, { PLATFORM_SECRETS_KEY: SECRETS_KEY });
  admin = (await staffWithMfa("admin")).c;
  A = await createTenant(env.db);
  ownerA = await sessionFor((await createUser(env.db, A.orgId, "owner")).email);
  fieldA = await sessionFor((await createUser(env.db, A.orgId, "field")).email);
});
afterAll(() => env.close());

describe("acesso ao console", () => {
  it("exige verificação em duas etapas e vale por sessão", async () => {
    const s = await createStaff(env.db);
    const c = await sessionFor(s.email);
    const blocked = await c.get("/v1/platform/customers");
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe("mfa_enrollment_required");
    const { secret } = (await c.post("/v1/platform/mfa/setup")).json();
    expect((await c.post("/v1/platform/mfa/enable", { code: "000000" })).statusCode).toBe(422);
    const counter = Math.floor(env.clock.now.getTime() / 30_000);
    expect(
      (await c.post("/v1/platform/mfa/enable", { code: totpAt(secret, counter) })).statusCode,
    ).toBe(200);
    expect((await c.get("/v1/platform/customers")).statusCode).toBe(200);

    // Nova sessão precisa confirmar o código de novo.
    const c2 = await sessionFor(s.email);
    expect((await c2.get("/v1/platform/customers")).json().error.code).toBe("mfa_required");
    expect(
      (await c2.post("/v1/platform/mfa/verify", { code: totpAt(secret, counter) })).statusCode,
    ).toBe(200);
    expect((await c2.get("/v1/platform/customers")).statusCode).toBe(200);
    const me = (await c2.get("/v1/auth/me")).json();
    expect(me.platform).toMatchObject({
      role: "admin",
      mfaRequired: true,
      mfaEnrolled: true,
      mfaVerified: true,
    });
  });

  it("papéis limitam o que cada pessoa faz", async () => {
    const finance = (await staffWithMfa("finance")).c;
    const support = (await staffWithMfa("support")).c;
    expect((await finance.get("/v1/platform/team")).statusCode).toBe(403);
    expect(
      (
        await support.post(`/v1/platform/customers/${A.orgId}/invoices`, {
          description: "x",
          amount: 10,
          dueOn: "2026-10-20",
        })
      ).statusCode,
    ).toBe(403);
    expect((await finance.get("/v1/platform/customers")).statusCode).toBe(200);
    expect((await support.get("/v1/platform/audit")).statusCode).toBe(200);
  });

  it("equipe gerida pelo console: convite, papel e nunca sem administrador", async () => {
    const email = `nova-${randomUUID()}@rebania.dev`;
    const r = await admin.post("/v1/platform/team", {
      email,
      name: "Nova Pessoa",
      role: "support",
    });
    expect(r.statusCode).toBe(201);
    // E-mail desligado: a senha provisória aparece uma vez para quem convidou.
    expect(r.json().provisionalPassword).toMatch(/^Prov-/);
    const u = await env.db.user.findUniqueOrThrow({ where: { email } });
    expect(u.mustChangePassword).toBe(true);
    expect((await admin.patch(`/v1/platform/team/${u.id}`, { role: "finance" })).statusCode).toBe(
      200,
    );
    // Cliente não vira equipe (D-12)
    const customer = await createUser(env.db, A.orgId, "manager");
    const refused = await admin.post("/v1/platform/team", {
      email: customer.email,
      name: "Xavier",
      role: "support",
    });
    expect(refused.json().error.code).toBe("platform_account_separation");
    // O único administrador não perde o papel
    const admins = await env.db.platformAdmin.findMany({ where: { role: "admin" } });
    for (const a of admins.slice(1))
      await env.db.platformAdmin.update({ where: { userId: a.userId }, data: { role: "support" } });
    const last = await admin.patch(`/v1/platform/team/${admins[0]!.userId}`, { role: "support" });
    expect(last.json().error.code).toBe("last_platform_admin");
    for (const a of admins.slice(1))
      await env.db.platformAdmin.update({ where: { userId: a.userId }, data: { role: "admin" } });
  });
});

describe("clientes e implantação", () => {
  it("implantação com modelo gera checklist; estágio segue o funil", async () => {
    const tpl = await admin.post("/v1/platform/onboarding-templates", {
      name: "Padrão",
      steps: [
        { title: "Reunião de início" },
        { title: "Importar planilha" },
        { title: "Treinar equipe" },
      ],
    });
    expect(tpl.statusCode).toBe(201);
    const r = await admin.post("/v1/platform/customers", {
      orgName: `Fazendas ${randomUUID().slice(0, 5)}`,
      farmName: "Sede",
      ownerEmail: `dono-${randomUUID()}@cliente.dev`,
      ownerName: "Dono",
      document: "12.345.678/0001-90",
      state: "mt",
      templateId: tpl.json().id,
    });
    expect(r.statusCode).toBe(201);
    const id = r.json().organizationId;
    const c = (await admin.get(`/v1/platform/customers/${id}`)).json();
    expect(c.stage).toBe("onboarding");
    expect(c.document).toBe("12345678000190");
    expect(c.state).toBe("MT");
    expect(c.onboarding.map((s: { title: string }) => s.title)).toEqual([
      "Reunião de início",
      "Importar planilha",
      "Treinar equipe",
    ]);
    expect(c.pendingInvitations).toHaveLength(1);
    const step = c.onboarding[0].id;
    expect(
      (await admin.patch(`/v1/platform/onboarding/steps/${step}`, { status: "done" })).statusCode,
    ).toBe(200);
    const board = (await admin.get("/v1/platform/onboarding"))
      .json()
      .items.find((x: { id: string }) => x.id === id);
    expect(board).toMatchObject({ total: 3, done: 1 });
    expect(board.signals.find((s: { key: string }) => s.key === "owner_accepted").done).toBe(false);

    const bad = await admin.post(`/v1/platform/customers/${id}/stage`, {
      stage: "lead",
      reason: "teste",
    });
    expect(bad.json().error.code).toBe("invalid_stage_transition");
    expect(
      (
        await admin.post(`/v1/platform/customers/${id}/stage`, {
          stage: "active",
          reason: "go-live",
        })
      ).statusCode,
    ).toBe(200);
  });

  it("notas internas são append-only no banco", async () => {
    const n = await admin.post(`/v1/platform/customers/${A.orgId}/notes`, {
      body: "Cliente pediu treinamento extra.",
    });
    expect(n.statusCode).toBe(201);
    await expect(
      env.db.orgNote.update({ where: { id: n.json().id }, data: { body: "x" } }),
    ).rejects.toThrow(/append-only/);
    const notes = (await admin.get(`/v1/platform/customers/${A.orgId}/notes`)).json().items;
    expect(notes[0].body).toContain("treinamento");
  });
});

describe("cobrança e somente leitura", () => {
  it("contrato ativo emite implantação e mensalidade; atraso > 15 dias bloqueia escrita até pagar", async () => {
    const T = await createTenant(env.db);
    const owner = await sessionFor((await createUser(env.db, T.orgId, "owner")).email);
    const field = await sessionFor(
      (await createUser(env.db, T.orgId, "field", { farmIds: [T.farmId] })).email,
    );
    await env.db.organization.update({ where: { id: T.orgId }, data: { stage: "active" } });
    const scope = { organizationIds: [T.orgId] };
    const plan = await admin.post("/v1/platform/plans", {
      name: `Completo ${randomUUID().slice(0, 4)}`,
      monthly: 900,
      implementation: 3000,
      limits: { farms: 2, users: 5 },
    });
    expect(plan.statusCode).toBe(201);
    const c = await admin.post(`/v1/platform/customers/${T.orgId}/contracts`, {
      planId: plan.json().id,
      startsOn: "2026-10-01",
      billingDay: 10,
      status: "active",
    });
    expect(c.statusCode).toBe(201);
    let inv = await env.db.invoice.findMany({
      where: { organizationId: T.orgId },
      orderBy: { dueOn: "asc" },
    });
    expect(inv.map((i) => i.kind)).toEqual(["implementation"]);

    await runBillingCycle(env.db, env.clock.now, "http://web.test", scope);
    await runBillingCycle(env.db, env.clock.now, "http://web.test", scope); // idempotente
    inv = await env.db.invoice.findMany({ where: { organizationId: T.orgId, kind: "monthly" } });
    expect(inv.map((i) => i.reference)).toEqual(["2026-10"]);
    expect(Number(inv[0]!.amountCents)).toBe(90000);

    // Implantação vence 15/10; outubro vence 10/10. Em 26/10 a mensalidade tem 16 dias de atraso.
    // (o relógio da API fica parado: só o ciclo roda "no futuro")
    const r = await runBillingCycle(
      env.db,
      new Date("2026-10-26T15:00:00Z"),
      "http://web.test",
      scope,
    );
    expect(r.readOnly).toBeGreaterThanOrEqual(1);
    const reminders = await env.db.invoiceReminder.findMany({ where: { organizationId: T.orgId } });
    expect(reminders.length).toBeGreaterThan(0);

    const me = (await owner.get("/v1/auth/me")).json();
    expect(me.memberships[0].accessMode).toBe("read_only");
    const write = await field.post(`/v1/farms/${T.farmId}/animals`, newAnimal());
    expect(write.statusCode).toBe(403);
    expect(write.json().error.code).toBe("org_read_only");
    const push = await field.post("/v1/sync/push", {
      farmId: T.farmId,
      deviceId: randomUUID(),
      mutations: [
        {
          type: "animal.create",
          mutationId: randomUUID(),
          entityId: randomUUID(),
          occurredAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          schemaVersion: 1,
          payload: newAnimal(),
        },
      ],
    });
    expect(push.json().error.code).toBe("org_read_only");
    expect((await field.get(`/v1/farms/${T.farmId}/animals`)).statusCode).toBe(200);
    // Suporte continua aberto
    const ticket = await field.post(`/v1/orgs/${T.orgId}/support/tickets`, {
      subject: "Paguei ontem",
      body: "Segue comprovante pelo WhatsApp.",
    });
    expect(ticket.statusCode).toBe(201);
    const plan2 = (await owner.get(`/v1/orgs/${T.orgId}/plan`)).json();
    expect(plan2.access.mode).toBe("read_only");
    expect(plan2.access.reason).toContain("16 dias");

    // Baixa das faturas em aberto devolve o acesso na hora
    for (const i of await env.db.invoice.findMany({
      where: { organizationId: T.orgId, status: "pending" },
    }))
      expect(
        (
          await admin.post(`/v1/platform/invoices/${i.id}/mark`, {
            status: "paid",
            note: "Pix conciliado",
          })
        ).statusCode,
      ).toBe(200);
    expect((await field.post(`/v1/farms/${T.farmId}/animals`, newAnimal())).statusCode).toBe(201);
    const audits = await env.db.auditEntry.findMany({
      where: { organizationId: T.orgId, action: { in: ["org.read_only", "org.access_restored"] } },
    });
    expect(audits.map((a) => a.action).sort()).toEqual(["org.access_restored", "org.read_only"]);

    const fin = (await admin.get("/v1/platform/finance")).json();
    expect(fin.mrrCents).toBeGreaterThanOrEqual(90000);
  });

  it("aditivo muda a mensalidade a partir da vigência", async () => {
    const T = await createTenant(env.db);
    const c = await admin.post(`/v1/platform/customers/${T.orgId}/contracts`, {
      plan: "Sob medida",
      monthly: 500,
      startsOn: "2026-09-01",
      billingDay: 5,
      status: "active",
    });
    await admin.post(`/v1/platform/contracts/${c.json().id}/amendments`, {
      description: "Segunda fazenda",
      monthly: 800,
      effectiveOn: "2026-10-01",
    });
    await runBillingCycle(env.db, new Date("2026-10-08T15:00:00Z"), "http://web.test", {
      organizationIds: [T.orgId],
    });
    const inv = await env.db.invoice.findMany({
      where: { organizationId: T.orgId, kind: "monthly" },
      orderBy: { reference: "asc" },
    });
    expect(inv.map((i) => [i.reference, Number(i.amountCents)])).toEqual([
      ["2026-09", 50000],
      ["2026-10", 80000],
    ]);
  });
});

describe("suporte", () => {
  it("chamado: nota interna não aparece ao cliente; isolado entre clientes", async () => {
    const t = await fieldA.post(`/v1/orgs/${A.orgId}/support/tickets`, {
      subject: "Leitor não conecta",
      body: "O bastão não aparece no Bluetooth.",
      priority: "high",
    });
    expect(t.statusCode).toBe(201);
    const id = t.json().id;
    await admin.post(`/v1/platform/tickets/${id}/messages`, {
      body: "Verificar modelo do leitor.",
      internal: true,
    });
    const reply = await admin.post(`/v1/platform/tickets/${id}/messages`, {
      body: "Qual o modelo do leitor?",
    });
    expect(reply.json().status).toBe("waiting_customer");
    const seen = (await fieldA.get(`/v1/orgs/${A.orgId}/support/tickets/${id}`)).json();
    expect(seen.messages.map((m: { body: string }) => m.body)).toEqual([
      "O bastão não aparece no Bluetooth.",
      "Qual o modelo do leitor?",
    ]);
    expect(seen.messages[1].authorName).toBe("Equipe Rebania");
    const staffView = (await admin.get(`/v1/platform/tickets/${id}`)).json();
    expect(staffView.messages).toHaveLength(3);
    expect(staffView.firstRespondedAt).not.toBeNull();

    // Outro cliente não vê nem responde
    const B = await createTenant(env.db);
    const ownerB = await sessionFor((await createUser(env.db, B.orgId, "owner")).email);
    expect((await ownerB.get(`/v1/orgs/${A.orgId}/support/tickets/${id}`)).statusCode).toBe(404);
    expect((await ownerB.get(`/v1/orgs/${B.orgId}/support/tickets/${id}`)).statusCode).toBe(404);
  });

  it("pedido de acesso: o proprietário aprova e a leitura de suporte abre", async () => {
    const support = await staffWithMfa("support");
    const before = await support.c.get(`/v1/platform/support/${A.orgId}/farms/${A.farmId}/summary`);
    expect(before.statusCode).toBe(403);
    const req = await support.c.post(`/v1/platform/customers/${A.orgId}/access-requests`, {
      reason: "Investigar rejeições de sincronização.",
      hours: 2,
    });
    expect(req.statusCode).toBe(201);
    // Funcionário de campo não decide
    expect(
      (
        await fieldA.post(`/v1/orgs/${A.orgId}/support-access-requests/${req.json().id}/decide`, {
          approve: true,
        })
      ).statusCode,
    ).toBe(403);
    const ok = await ownerA.post(
      `/v1/orgs/${A.orgId}/support-access-requests/${req.json().id}/decide`,
      {
        approve: true,
      },
    );
    expect(ok.json().grantId).toBeTruthy();
    expect(
      (await support.c.get(`/v1/platform/support/${A.orgId}/farms/${A.farmId}/summary`)).statusCode,
    ).toBe(200);
  });
});

describe("usuários dos clientes, senha e e-mail", () => {
  it("esqueci minha senha: sem e-mail ligado não gera link; ligado, o link troca a senha uma vez", async () => {
    const u = await createUser(env.db, A.orgId, "manager");
    const anon = client(env.app, { "x-rebania-csrf": "1" });
    const off = await anon.post("/v1/auth/password-reset/request", { email: u.email });
    expect(off.json()).toEqual({ ok: true, emailEnabled: false });
    expect(await env.db.passwordResetToken.count({ where: { userId: u.id } })).toBe(0);

    await setSetting(
      env.db,
      "mail",
      { enabled: true, fromEmail: "nao-responda@rebania.com.br" },
      null,
    );
    const on = await anon.post("/v1/auth/password-reset/request", { email: u.email });
    expect(on.json().emailEnabled).toBe(true);
    const mail = await env.db.emailMessage.findFirstOrThrow({
      where: { toEmail: u.email, template: "password_reset" },
    });
    expect(mail.status).toBe("queued");
    const token = /token=([A-Za-z0-9_-]+)/.exec(mail.text)![1]!;
    const ok = await anon.post("/v1/auth/password-reset/confirm", {
      token,
      newPassword: "senha-nova-forte-1",
    });
    expect(ok.statusCode).toBe(200);
    expect(
      (
        await anon.post("/v1/auth/password-reset/confirm", {
          token,
          newPassword: "outra-senha-forte",
        })
      ).statusCode,
    ).toBe(410);
    const login2 = await anon.post("/v1/auth/login", {
      email: u.email,
      password: "senha-nova-forte-1",
      channel: "mobile",
    });
    expect(login2.statusCode).toBe(200);
    await setSetting(env.db, "mail", { enabled: false }, null);
  });

  it("VeloMail: entrega com a chave do cofre e webhook assinado marca como entregue", async () => {
    await admin.put("/v1/platform/settings/mail", {
      enabled: true,
      fromEmail: "nao-responda@rebania.com.br",
      fromName: "Rebania",
      replyTo: null,
      apiBaseUrl: "https://www.velomail.com.br/api",
      teamEmail: "equipe@rebania.com.br",
      apiKey: "re_teste_123",
      webhookSecret: "segredo-webhook",
    });
    const settings = (await admin.get("/v1/platform/settings")).json();
    expect(settings.mail.apiKey.configured).toBe(true);
    expect(JSON.stringify(settings)).not.toContain("re_teste_123");

    const test = await admin.post("/v1/platform/settings/mail/test", {
      to: "teste@rebania.com.br",
    });
    expect(test.json().status).toBe("queued");
    let sentKey = "";
    const fake = (async (_url: string, init: RequestInit) => {
      sentKey = (init.headers as Record<string, string>)["x-api-key"]!;
      return new Response(JSON.stringify({ message_id: "vm-1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const box = (await import("@rebania/saas")).createSecretBox(SECRETS_KEY);
    expect(await deliverEmail(env.db, box, test.json().id, { fetch: fake })).toBe("sent");
    expect(sentKey).toBe("re_teste_123");

    const body = JSON.stringify({ event: "email.delivered", data: { message_id: "vm-1" } });
    const sig = `sha256=${createHmac("sha256", "segredo-webhook").update(body).digest("hex")}`;
    const hook = await env.app.inject({
      method: "POST",
      url: "/v1/mail/webhooks/velomail",
      headers: { "content-type": "application/json", "x-webhook-signature": sig },
      payload: body,
    });
    expect(hook.statusCode).toBe(200);
    const bad = await env.app.inject({
      method: "POST",
      url: "/v1/mail/webhooks/velomail",
      headers: { "content-type": "application/json", "x-webhook-signature": "sha256=00" },
      payload: body,
    });
    expect(bad.statusCode).toBe(401);
    expect(
      (await env.db.emailMessage.findUniqueOrThrow({ where: { id: test.json().id } })).status,
    ).toBe("delivered");
    await setSetting(env.db, "mail", { enabled: false }, null);
  });

  it("suporte encerra sessões e desativa usuário do cliente, com auditoria", async () => {
    const u = await createUser(env.db, A.orgId, "field");
    const c = await sessionFor(u.email);
    const support = (await staffWithMfa("support")).c;
    const users = (await support.get(`/v1/platform/customers/${A.orgId}/users`)).json().items;
    expect(users.some((x: { userId: string }) => x.userId === u.id)).toBe(true);
    expect(
      (
        await support.post(`/v1/platform/users/${u.id}/revoke-sessions`, {
          reason: "Celular roubado",
        })
      ).json().revoked,
    ).toBe(1);
    expect((await c.get("/v1/auth/me")).statusCode).toBe(401);
    await support.post(`/v1/platform/users/${u.id}/disable`, { reason: "Saiu da fazenda" });
    const l = await env.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: { "x-rebania-csrf": "1" },
      payload: { email: u.email, password: PASSWORD, channel: "mobile" },
    });
    expect(l.statusCode).toBe(401);
    const audit = (await admin.get(`/v1/platform/audit?orgId=${A.orgId}&action=support.`)).json()
      .items;
    expect(audit.map((a: { action: string }) => a.action)).toEqual(
      expect.arrayContaining(["support.sessions_revoked", "support.user_disabled"]),
    );
    const csv = await admin.get(`/v1/platform/audit.csv?orgId=${A.orgId}`);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.body).toContain("support.user_disabled");
  });
});

describe("visão geral, operação e comunicados", () => {
  it("painéis respondem e comunicado chega só ao público certo", async () => {
    const ov = (await admin.get("/v1/platform/overview")).json();
    expect(ov.customers.byStage).toHaveProperty("active");
    expect(Array.isArray(ov.alerts)).toBe(true);
    const ops = (await admin.get("/v1/platform/ops")).json();
    expect(ops.secretsKeyConfigured).toBe(true);
    expect(ops.databaseBytes).toBeGreaterThan(0);

    const B = await createTenant(env.db);
    const ownerB = await sessionFor((await createUser(env.db, B.orgId, "owner")).email);
    const a = await admin.post("/v1/platform/announcements", {
      title: "Manutenção programada",
      body: "Sábado, das 22h às 23h.",
      level: "maintenance",
      organizationIds: [A.orgId],
      startsAt: new Date(env.clock.now.getTime() - 60_000).toISOString(),
    });
    expect(a.statusCode).toBe(201);
    const seenA = (await ownerA.get("/v1/announcements")).json().items;
    const seenB = (await ownerB.get("/v1/announcements")).json().items;
    expect(seenA.some((x: { id: string }) => x.id === a.json().id)).toBe(true);
    expect(seenB.some((x: { id: string }) => x.id === a.json().id)).toBe(false);
  });
});
