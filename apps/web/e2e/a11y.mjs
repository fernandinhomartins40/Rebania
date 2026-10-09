import { chromium } from "playwright";
import fs from "node:fs";
import { createRequire } from "node:module";

/**
 * Auditoria de acessibilidade (axe, WCAG 2 A/AA) e de rolagem lateral em 360,
 * 768 e 1280 px. Rodar com a stack local de pé (pnpm dev) e o usuário de
 * desenvolvimento: E2E_URL=http://localhost:5173 E2E_EMAIL=... E2E_PASSWORD=... pnpm --filter @rebania/web a11y
 */
const require = createRequire(import.meta.url);
const axe = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const U = process.env.E2E_URL ?? "http://localhost:5173";
const routes = [
  "/",
  "/rebanho",
  "/registrar",
  "/agenda",
  "/fazenda",
  "/registrar/animal",
  "/registrar/pesagem",
  "/registrar/aplicacao",
  "/registrar/inseminacao",
  "/registrar/nascimento",
  "/sanidade",
  "/fazenda/estoque",
  "/curral",
  "/curral/nova",
  "/comercial",
  "/comercial/venda",
  "/fazenda/financeiro",
  "/relatorios",
  "/reproducao",
  "/ocorrencias",
  "/fazenda/confinamento",
  "/fazenda/pastagem",
  "/fazenda/patrimonio",
  "/assistente",
  "/fazenda/plano",
  "/fazenda/configuracoes",
  "/fazenda/equipe",
  "/fazenda/sincronizacao",
  "/console",
];
const b = await chromium.launch();
const results = {};
for (const width of [360, 768, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(U + "/entrar");
  await p.getByLabel("E-mail").fill(process.env.E2E_EMAIL ?? "dono@piloto.dev");
  await p.getByLabel("Senha").fill(process.env.E2E_PASSWORD ?? "senha-forte-123");
  await p.getByRole("button", { name: "Entrar" }).click();
  await p
    .getByText(/animais/)
    .first()
    .waitFor();
  for (const r of routes) {
    await p.goto(U + r);
    await p.waitForTimeout(900);
    const overflow = await p.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    await p.addScriptTag({ content: axe });
    const v = await p.evaluate(async () => {
      const res = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] });
      return res.violations.map((x) => ({
        id: x.id,
        impact: x.impact,
        n: x.nodes.length,
        sample: x.nodes[0]?.target?.join(" "),
      }));
    });
    const key = `${r}@${width}`;
    if (overflow > 1 || v.length) results[key] = { overflow, v };
  }
  await ctx.close();
}
await b.close();

const ids = {};
for (const [k, x] of Object.entries(results))
  for (const v of x.v) (ids[v.id] ??= []).push(`${k} ${v.sample}`);
for (const [id, list] of Object.entries(ids))
  console.log(id, list.length, "|", list.slice(0, 3).join(" || "));
for (const [k, x] of Object.entries(results))
  if (x.overflow > 1) console.log("OVERFLOW", k, x.overflow);

const failures = Object.keys(results).length;
console.log(
  failures ? `${failures} tela(s) com problema.` : "Sem violações WCAG A/AA nem rolagem lateral.",
);
process.exit(failures ? 1 : 0);
