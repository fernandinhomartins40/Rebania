import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { renderEmail, TEMPLATES } from "./mail/templates.ts";
import { sendViaVeloMail, verifyVeloMailSignature, VeloMailError } from "./mail/velomail.ts";
import { createSecretBox, parseSecretsKey } from "./secrets.ts";

describe("cofre de segredos", () => {
  const key = randomBytes(32).toString("base64");

  it("cifra e decifra; o texto cifrado muda a cada vez", () => {
    const box = createSecretBox(key);
    const a = box.seal("re_chave");
    expect(a).not.toContain("re_chave");
    expect(box.seal("re_chave")).not.toBe(a);
    expect(box.open(a)).toBe("re_chave");
  });

  it("chave errada não abre", () => {
    const sealed = createSecretBox(key).seal("x");
    expect(() => createSecretBox(randomBytes(32).toString("hex")).open(sealed)).toThrow();
  });

  it("sem chave válida fica indisponível", () => {
    expect(createSecretBox(undefined).available).toBe(false);
    expect(parseSecretsKey("curta")).toBeNull();
    expect(() => createSecretBox(null).seal("x")).toThrow(/PLATFORM_SECRETS_KEY/);
  });
});

describe("VeloMail", () => {
  it("assinatura do webhook", () => {
    const body = JSON.stringify({ event: "email.delivered" });
    const sig = `sha256=${createHmac("sha256", "s3gr3do").update(body).digest("hex")}`;
    expect(verifyVeloMailSignature(body, sig, "s3gr3do")).toBe(true);
    expect(verifyVeloMailSignature(body, sig, "outro")).toBe(false);
    expect(verifyVeloMailSignature(body, "", "s3gr3do")).toBe(false);
  });

  it("envia com x-api-key e devolve o id", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ message_id: "m-1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await sendViaVeloMail(
      "https://www.velomail.com.br/api/",
      "re_x",
      { from: "a@b.com", to: "c@d.com", subject: "s", text: "t" },
      { fetch: fake },
    );
    expect(r.messageId).toBe("m-1");
    expect(seen!.url).toBe("https://www.velomail.com.br/api/emails/send");
    expect((seen!.init.headers as Record<string, string>)["x-api-key"]).toBe("re_x");
  });

  it("4xx não repete; 429 e 5xx repetem", async () => {
    const reply = (status: number) =>
      (async () =>
        new Response(JSON.stringify({ error: "x" }), { status })) as unknown as typeof fetch;
    const call = (status: number) =>
      sendViaVeloMail(
        "https://x",
        "k",
        { from: "a@b.c", to: "c@d.e", subject: "s" },
        { fetch: reply(status) },
      );
    await expect(call(422)).rejects.toMatchObject({ retryable: false });
    await expect(call(429)).rejects.toMatchObject({ retryable: true });
    await expect(call(503)).rejects.toBeInstanceOf(VeloMailError);
  });
});

describe("modelos de e-mail", () => {
  it("todo modelo tem assunto, HTML e texto", () => {
    const sample: Record<string, unknown> = {
      mail_test: {},
      password_reset: { name: "Ana", url: "https://x/r", requestedByStaff: false },
      invitation: {
        organizationName: "Org",
        roleLabel: "Gerente",
        url: "https://x/c",
        expiresOn: "2026-10-18",
      },
      staff_welcome: { name: "Ana", roleLabel: "Suporte", url: "https://x/r" },
      invoice_issued: {
        organizationName: "Org",
        description: "Mensalidade",
        amountCents: 12345,
        dueOn: "2026-10-10",
        paymentUrl: null,
        instructions: "Pix: chave",
        planUrl: "https://x/p",
      },
      invoice_reminder: {
        stage: "overdue",
        description: "Mensalidade",
        amountCents: 100,
        dueOn: "2026-10-10",
        paymentUrl: "https://pay",
        instructions: null,
        planUrl: "https://x/p",
        graceDays: 15,
      },
      access_read_only: {
        organizationName: "Org",
        reason: "Fatura vencida.",
        planUrl: "https://x/p",
      },
      access_restored: { organizationName: "Org" },
      ticket_reply: { number: 7, subject: "Ajuda", excerpt: "Oi", url: "https://x/t" },
      ticket_new_team: {
        number: 7,
        subject: "Ajuda",
        organizationName: "Org",
        priority: "Alta",
        url: "https://x",
      },
      support_access_request: {
        organizationName: "Org",
        staffName: "Ana",
        hours: 4,
        reason: "Ver sync",
        url: "https://x",
      },
    };
    for (const name of Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]) {
      const r = renderEmail(name, "https://www.rebania.com.br/", sample[name] as never);
      expect(r.subject.length).toBeGreaterThan(3);
      expect(r.html).toContain("https://www.rebania.com.br/brand/rebania-logo.png");
      expect(r.text.length).toBeGreaterThan(10);
    }
  });

  it("escapa HTML dos dados", () => {
    const r = renderEmail("access_restored", "https://x", {
      organizationName: "<script>x</script>",
    });
    expect(r.html).not.toContain("<script>x");
    expect(r.html).toContain("&lt;script&gt;");
  });

  it("valores em reais e datas no formato brasileiro", () => {
    const r = renderEmail("invoice_issued", "https://x", {
      organizationName: "Org",
      description: "Mensalidade",
      amountCents: 123456,
      dueOn: "2026-10-05",
      paymentUrl: null,
      instructions: null,
      planUrl: "https://x/p",
    });
    expect(r.text).toMatch(/R\$\s?1\.234,56/);
    expect(r.text).toContain("05/10/2026");
  });
});
