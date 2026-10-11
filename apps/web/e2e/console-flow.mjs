import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

/**
 * Usa os formulários do console de ponta a ponta (rodar depois de console-tour.mjs, que
 * deixa a verificação em duas etapas configurada e o segredo TOTP em E2E_OUT).
 *   E2E_URL=... E2E_EMAIL=... E2E_PASSWORD=... E2E_OUT=... node e2e/console-flow.mjs
 */
const U = process.env.E2E_URL ?? "http://localhost:5173";
const OUT = process.env.E2E_OUT ?? "./var/console-tour";
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function totp(secret) {
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of secret.trim().toUpperCase()) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const h = createHmac("sha1", Buffer.from(bytes)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

const errors = [];
const steps = [];
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
p.on("response", (r) => {
  if (r.url().includes("/v1/") && r.status() >= 400 && !r.url().endsWith("/v1/auth/me"))
    errors.push(`${r.status()} ${r.request().method()} ${r.url().replace(U, "")}`);
});
// Motivos e confirmações (window.prompt/confirm/alert)
let promptAnswer = "Pix conferido no extrato";
p.on("dialog", async (d) => {
  if (d.type() === "prompt") await d.accept(promptAnswer);
  else await d.accept();
});
const step = async (name, fn) => {
  try {
    await fn();
    steps.push(`ok   ${name}`);
  } catch (e) {
    steps.push(`FALHA ${name}: ${e.message.split("\n")[0]}`);
    await p.screenshot({
      path: path.join(OUT, `falha-${name.replace(/\W+/g, "-")}.png`),
      fullPage: true,
    });
  }
};

await p.goto(`${U}/entrar`);
await p.getByLabel("E-mail").fill(process.env.E2E_EMAIL);
await p.getByLabel("Senha").fill(process.env.E2E_PASSWORD);
await p.getByRole("button", { name: "Entrar" }).click();
await p.getByRole("heading", { name: "Confirme o código" }).waitFor();
await p
  .getByLabel("Código de 6 dígitos")
  .fill(totp(fs.readFileSync(path.join(OUT, "totp-secret.txt"), "utf8")));
await p.getByRole("button", { name: "Entrar no console" }).click();
await p.getByRole("heading", { name: "Visão geral" }).waitFor();

const suffix = Date.now().toString().slice(-5);
const orgName = `Agropecuária Teste ${suffix}`;

await step("modelo de checklist", async () => {
  await p.goto(`${U}/console/implantacoes`);
  await p.getByRole("button", { name: "Novo modelo" }).click();
  await p.getByLabel("Nome do modelo").fill(`Padrão ${suffix}`);
  await p.getByLabel("Etapas").fill("Reunião de início\nImportar planilha\nTreinar a equipe");
  await p.getByRole("button", { name: "Criar modelo" }).click();
  await p.getByText(`Padrão ${suffix}`).waitFor();
});

await step("nova implantação", async () => {
  await p.goto(`${U}/console/clientes`);
  await p.getByRole("button", { name: "Nova implantação" }).click();
  await p.getByLabel("Cliente (organização)").fill(orgName);
  await p.getByLabel("Primeira fazenda").fill("Fazenda Boa Vista");
  await p.getByLabel("E-mail do proprietário").fill(`dono${suffix}@cliente.dev`);
  await p.getByLabel(/CPF ou CNPJ/).fill("12.345.678/0001-90");
  await p.getByLabel(/^Cidade/).fill("Cuiabá");
  await p.getByLabel(/^UF/).fill("MT");
  await p.getByLabel("Checklist de implantação").selectOption({ label: `Padrão ${suffix}` });
  await p.getByRole("button", { name: "Criar cliente e convidar proprietário" }).click();
  await p.getByText("Cliente criado.").waitFor();
  await p.getByRole("link", { name: orgName }).click();
  await p.getByRole("heading", { name: orgName }).waitFor();
});
const customerUrl = p.url().split("?")[0];

await step("plano no catálogo", async () => {
  await p.goto(`${U}/console/planos`);
  await p.getByRole("button", { name: "Novo plano" }).click();
  await p.locator("#pl-name").fill(`Completo ${suffix}`);
  await p.locator("#pl-impl").fill("3.000,00");
  await p.locator("#pl-month").fill("900,00");
  await p.locator("#pl-lim-farms").fill("2");
  await p.getByRole("button", { name: "Criar plano" }).click();
  await p.getByRole("heading", { name: new RegExp(`Completo ${suffix}`) }).waitFor();
});

await step("contrato ativo a partir do catálogo", async () => {
  await p.goto(`${customerUrl}?aba=contrato`);
  await p.getByRole("button", { name: "Novo contrato" }).click();
  await p.getByLabel(/Plano do catálogo/).selectOption({ label: `Completo ${suffix}` });
  await p.getByRole("button", { name: "Criar e ativar" }).click();
  await p.getByText("Ativo", { exact: true }).first().waitFor();
});

await step("fatura de implantação emitida e baixa", async () => {
  await p.goto(`${customerUrl}?aba=faturas`);
  await p.getByText(/Implantação · Completo/).waitFor();
  promptAnswer = "Pix conferido no extrato";
  await p.getByRole("button", { name: "Dar baixa" }).first().click();
  await p.getByText("Paga", { exact: true }).first().waitFor();
});

await step("fatura avulsa com link de pagamento", async () => {
  await p.getByRole("button", { name: "Nova fatura avulsa" }).click();
  await p.getByLabel("Descrição").fill("Treinamento extra");
  await p.getByLabel("Valor (R$)").fill("450,00");
  await p.getByLabel(/Link de pagamento/).fill("https://pagamento.exemplo/abc");
  await p.getByRole("button", { name: "Emitir fatura" }).click();
  await p.getByText("Treinamento extra").waitFor();
});

await step("checklist: concluir etapa", async () => {
  await p.goto(`${customerUrl}?aba=implantacao`);
  await p.getByLabel("Situação de Reunião de início").selectOption("done");
  await p.getByText("1 de 3 etapas").waitFor();
});

await step("contato financeiro e nota interna", async () => {
  await p.goto(`${customerUrl}?aba=contatos`);
  await p.getByRole("button", { name: "Adicionar contato" }).click();
  await p.getByLabel("Nome", { exact: true }).fill("Maria Financeiro");
  await p.getByLabel("E-mail").fill(`financeiro${suffix}@cliente.dev`);
  await p.getByLabel(/Contato financeiro/).check();
  await p.getByRole("button", { name: "Adicionar contato" }).click();
  await p.getByText("Maria Financeiro").waitFor();
  await p.getByLabel("Nova nota").fill("Cliente pediu treinamento para 3 vaqueiros.");
  await p.getByRole("button", { name: "Registrar nota" }).click();
  await p.getByText("Cliente pediu treinamento").waitFor();
});

await step("chamado registrado do WhatsApp e resposta", async () => {
  await p.goto(`${customerUrl}?aba=suporte`);
  await p.getByRole("button", { name: /Registrar atendimento/ }).click();
  await p.getByLabel("Assunto").fill("Dúvida sobre importação");
  await p.getByLabel("O que o cliente pediu").fill("Como importo a planilha de pesagens?");
  await p.getByRole("button", { name: "Abrir chamado" }).click();
  await p.getByRole("link", { name: /Dúvida sobre importação/ }).click();
  await p.getByLabel("Resposta").fill("Use Fazenda → Importar; envio o modelo por aqui.");
  await p.getByRole("button", { name: "Enviar resposta" }).click();
  await p.getByText("Use Fazenda → Importar").waitFor();
  await p.screenshot({ path: path.join(OUT, "30-chamado.png"), fullPage: true });
});

await step("suspender e reativar (somente leitura)", async () => {
  await p.goto(`${customerUrl}?aba=resumo`);
  await p.getByRole("button", { name: "Marcar como ativo" }).click();
  await p.getByRole("button", { name: "Suspender" }).waitFor();
  promptAnswer = "Teste de suspensão";
  await p.getByRole("button", { name: "Suspender" }).click();
  await p.getByText("somente leitura", { exact: true }).first().waitFor();
  await p.screenshot({ path: path.join(OUT, "31-suspenso.png"), fullPage: true });
  await p.getByRole("button", { name: "Reativar" }).click();
  await p.getByRole("button", { name: "Suspender" }).waitFor();
});

await step("comunicado", async () => {
  await p.goto(`${U}/console/comunicados`);
  await p.getByRole("button", { name: "Novo comunicado" }).click();
  await p.getByLabel("Título").fill(`Manutenção ${suffix}`);
  await p.getByLabel("Mensagem").fill("Sábado, das 22h às 23h.");
  await p.getByRole("button", { name: "Publicar" }).click();
  await p.getByText(`Manutenção ${suffix}`).waitFor();
});

await step("pessoa na equipe", async () => {
  await p.goto(`${U}/console/equipe`);
  await p.getByRole("button", { name: "Adicionar pessoa" }).click();
  await p.getByLabel("Nome").fill(`Suporte ${suffix}`);
  await p.getByLabel("E-mail").fill(`suporte${suffix}@rebania.dev`);
  await p.getByRole("button", { name: "Adicionar", exact: true }).click();
  await p.locator(".secret-box").waitFor();
});

await step("auditoria mostra as ações", async () => {
  await p.goto(`${U}/console/auditoria`);
  await p.getByText("Fatura paga (baixa)").first().waitFor();
});

await p.goto(`${customerUrl}?aba=resumo`);
await p.screenshot({ path: path.join(OUT, "32-cliente-final.png"), fullPage: true });
await p.goto(`${U}/console`);
await p.screenshot({ path: path.join(OUT, "33-visao-geral-com-dados.png"), fullPage: true });
console.log(steps.join("\n"));
console.log(JSON.stringify({ errors }, null, 2));
await b.close();
