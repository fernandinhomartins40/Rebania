import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

/**
 * Percorre o console da plataforma como superadmin: primeiro acesso (senha provisória e
 * verificação em duas etapas) e todas as telas, em desktop e celular, com captura de tela.
 * Uso (stack local de pé):
 *   E2E_URL=http://localhost:5173 E2E_EMAIL=... E2E_PASSWORD=... E2E_OUT=./var/tour node e2e/console-tour.mjs
 * Com E2E_NEW_PASSWORD, troca a senha provisória no caminho. Guarda o segredo TOTP em E2E_OUT.
 */
const U = process.env.E2E_URL ?? "http://localhost:5173";
const OUT = process.env.E2E_OUT ?? "./var/console-tour";
fs.mkdirSync(OUT, { recursive: true });

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function totp(secret) {
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of secret.replace(/\s+/g, "").toUpperCase()) {
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
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
const p = await ctx.newPage();
p.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
p.on("response", (r) => r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`));

await p.goto(`${U}/entrar`);
await p.getByLabel("E-mail").fill(process.env.E2E_EMAIL);
await p.getByLabel("Senha").fill(process.env.E2E_PASSWORD);
await p.getByRole("button", { name: "Entrar" }).click();
// Espera a tela seguinte de verdade (troca de senha, duas etapas ou o console).
const next = () =>
  p
    .locator("h1")
    .filter({ hasText: /Crie sua senha|Verificação em duas etapas|Confirme o código|Visão geral/ })
    .first()
    .waitFor();
await next();

if (
  await p
    .getByText("Crie sua senha")
    .isVisible()
    .catch(() => false)
) {
  await p.screenshot({ path: path.join(OUT, "00-senha-provisoria.png") });
  await p.locator("#pw-current").fill(process.env.E2E_PASSWORD);
  await p.locator("#pw-new").fill(process.env.E2E_NEW_PASSWORD);
  await p.locator("#pw-confirm").fill(process.env.E2E_NEW_PASSWORD);
  await p.getByRole("button", { name: "Salvar nova senha" }).click();
  await p.getByText("Crie sua senha").waitFor({ state: "detached" });
  await next();
}

const secretFile = path.join(OUT, "totp-secret.txt");
if (
  await p
    .getByText("Verificação em duas etapas")
    .isVisible()
    .catch(() => false)
) {
  await p.locator(".secret-box").waitFor();
  await p.screenshot({ path: path.join(OUT, "01-duas-etapas.png") });
  const secret = (await p.locator(".secret-box").innerText()).trim();
  fs.writeFileSync(secretFile, secret);
  await p.getByLabel("Código de 6 dígitos").fill(totp(secret));
  await p.getByRole("button", { name: "Ativar" }).click();
  await p.getByRole("heading", { name: "Visão geral" }).waitFor();
} else if (
  await p
    .getByText("Confirme o código")
    .isVisible()
    .catch(() => false)
) {
  await p.getByLabel("Código de 6 dígitos").fill(totp(fs.readFileSync(secretFile, "utf8")));
  await p.getByRole("button", { name: "Entrar no console" }).click();
  await p.getByRole("heading", { name: "Visão geral" }).waitFor();
}

const pages = [
  ["02-visao-geral", "/console"],
  ["03-clientes", "/console/clientes?demo=include"],
  ["05-implantacoes", "/console/implantacoes"],
  ["06-cobranca", "/console/cobranca"],
  ["07-planos", "/console/planos"],
  ["08-suporte", "/console/suporte"],
  ["09-comunicados", "/console/comunicados"],
  ["10-operacao", "/console/operacao"],
  ["11-auditoria", "/console/auditoria"],
  ["12-equipe", "/console/equipe"],
  ["13-configuracoes", "/console/configuracoes"],
];
for (const [name, url] of pages) {
  await p.goto(U + url);
  await p.waitForLoadState("networkidle");
  await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

// Ficha do primeiro cliente, aba por aba
await p.goto(`${U}/console/clientes?demo=include`);
await p.waitForLoadState("networkidle");
const first = p.locator("table.data tbody a").first();
if (await first.count()) {
  const href = await first.getAttribute("href");
  for (const aba of [
    "resumo",
    "implantacao",
    "contrato",
    "faturas",
    "creditos",
    "usuarios",
    "suporte",
    "contatos",
    "historico",
  ]) {
    await p.goto(`${U}${href}?aba=${aba}`);
    await p.waitForLoadState("networkidle");
    await p.screenshot({ path: path.join(OUT, `04-cliente-${aba}.png`), fullPage: true });
  }
}

// Celular: menu recolhível e uma tela densa
await p.setViewportSize({ width: 375, height: 800 });
await p.goto(`${U}/console/cobranca`);
await p.waitForLoadState("networkidle");
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
await p.screenshot({ path: path.join(OUT, "20-celular-cobranca.png"), fullPage: true });
await p.getByRole("button", { name: "Abrir menu" }).click();
await p.screenshot({ path: path.join(OUT, "21-celular-menu.png") });

console.log(JSON.stringify({ errors, mobileOverflowPx: overflow }, null, 2));
await b.close();
