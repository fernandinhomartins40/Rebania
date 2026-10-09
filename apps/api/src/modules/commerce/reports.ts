import type { ReportDto } from "@rebania/contracts";
import {
  adgReport,
  CATEGORIES,
  CATEGORY_FIN_LABEL,
  CATEGORY_LABEL,
  coverage,
  pregnancyRate,
  type EntryCategory,
} from "@rebania/domain";
import type { Db } from "@rebania/db";
import { civilToDate, dateToCivil } from "../../lib/dates.ts";
import type { FarmContext } from "../../lib/tenant.ts";

type Kind = ReportDto["kind"];
const R = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export async function buildReport(
  db: Db,
  fctx: FarmContext,
  kind: Kind,
  from: string,
  to: string,
): Promise<ReportDto> {
  const period = { from, to };
  const range = { gte: civilToDate(from), lte: civilToDate(to) };
  const farmId = fctx.farmId;
  switch (kind) {
    case "inventory": {
      const animals = await db.animal.findMany({
        where: { farmId, status: "active" },
        select: { category: true, group: { select: { name: true } } },
      });
      const rows = CATEGORIES.map((c) => {
        const list = animals.filter((a) => a.category === c);
        return { category: CATEGORY_LABEL[c], heads: list.length };
      }).filter((r) => r.heads > 0);
      const byGroup = new Map<string, number>();
      for (const a of animals) {
        const g = a.group?.name ?? "Sem lote";
        byGroup.set(g, (byGroup.get(g) ?? 0) + 1);
      }
      return {
        kind,
        title: "Inventário do rebanho",
        period,
        formula: "Contagem dos animais com situação Ativo na data da consulta, por categoria.",
        coverage: null,
        columns: [
          { key: "category", label: "Categoria", type: "text" },
          { key: "heads", label: "Cabeças", type: "number" },
        ],
        rows,
        totals: { category: "Total", heads: animals.length },
        notes: [...byGroup.entries()].map(([g, n]) => `${g}: ${n} cabeça(s)`),
      };
    }
    case "performance": {
      const animals = await db.animal.findMany({
        where: { farmId, status: "active" },
        select: {
          id: true,
          groupId: true,
          group: { select: { name: true } },
          weights: {
            where: { voidedAt: null },
            select: { measuredOn: true, weightKg: true },
          },
        },
      });
      const r = adgReport(
        animals.map((a) => ({
          id: a.id,
          groupKey: a.groupId ?? "none",
          groupLabel: a.group?.name ?? "Sem lote",
          weights: a.weights.map((w) => ({
            measuredOn: dateToCivil(w.measuredOn),
            weightKg: Number(w.weightKg),
          })),
        })),
        from,
        to,
      );
      return {
        kind,
        title: "Desempenho (GMD) por lote",
        period,
        formula:
          "GMD individual = (última pesagem − primeira pesagem no período) ÷ dias entre elas. Média simples dos GMDs individuais por lote. Pesagens com mesma data ou intervalo não positivo não entram.",
        coverage: {
          ...r.coverage,
          note: "Animais ativos com ao menos duas pesagens válidas em datas diferentes dentro do período.",
        },
        columns: [
          { key: "label", label: "Lote", type: "text" },
          { key: "animals", label: "Animais", type: "number" },
          { key: "withAdg", label: "Com GMD", type: "number" },
          { key: "meanAdg", label: "GMD médio (kg/dia)", type: "number" },
          { key: "invalidInterval", label: "Intervalo inválido", type: "number" },
        ],
        rows: r.rows.map((x) => ({ ...x })),
        totals: null,
        notes: ["Peso vivo em kg. Não é convertido em arroba."],
      };
    }
    case "reproduction": {
      const [breedings, checks, births] = await Promise.all([
        db.breedingEvent.findMany({
          where: { farmId, voidedAt: null, date: range },
          select: { femaleId: true },
        }),
        db.pregnancyCheck.findMany({
          where: { farmId, voidedAt: null, date: range },
          select: { femaleId: true, result: true, date: true },
          orderBy: { date: "asc" },
        }),
        db.birth.findMany({ where: { farmId, date: range }, include: { calves: true } }),
      ]);
      const exposed = [...new Set(breedings.map((b) => b.femaleId))];
      const last = new Map<string, "pregnant" | "open" | "inconclusive">();
      for (const c of checks) last.set(c.femaleId, c.result);
      const rate = pregnancyRate(
        exposed.map((id) => ({ animalId: id, lastResult: last.get(id) ?? null })),
      );
      const calves = births.flatMap((b) => b.calves);
      const live = calves.filter((c) => !c.stillborn).length;
      return {
        kind,
        title: "Reprodução",
        period,
        formula:
          "Taxa de prenhez = prenhas ÷ (prenhas + vazias) entre as fêmeas cobertas/inseminadas no período. Inconclusivo e sem diagnóstico não contam como vazia.",
        coverage: {
          ...coverage(exposed.filter((id) => last.has(id)).length, exposed.length),
          note: "Fêmeas expostas no período que têm diagnóstico registrado.",
        },
        columns: [
          { key: "metric", label: "Indicador", type: "text" },
          { key: "value", label: "Valor", type: "number" },
        ],
        rows: [
          { metric: "Fêmeas expostas (cobertura/IA)", value: exposed.length },
          { metric: "Diagnosticadas", value: exposed.filter((id) => last.has(id)).length },
          {
            metric: "Prenhas",
            value: [...last.entries()].filter(([id, r]) => exposed.includes(id) && r === "pregnant")
              .length,
          },
          {
            metric: "Taxa de prenhez (%)",
            value: rate.rateAmongDiagnosed === null ? null : R(rate.rateAmongDiagnosed * 100, 1),
          },
          { metric: "Partos", value: births.length },
          { metric: "Crias vivas", value: live },
          { metric: "Natimortos", value: calves.length - live },
        ],
        totals: null,
        notes: [],
      };
    }
    case "mortality": {
      const [dead, everActive] = await Promise.all([
        db.animal.findMany({
          where: { farmId, status: "dead", exitDate: range },
          select: { id: true, category: true, exitReason: true, exitDate: true },
        }),
        db.animal.count({
          where: {
            farmId,
            createdAt: { lte: new Date(`${to}T23:59:59Z`) },
            OR: [{ exitDate: null }, { exitDate: { gte: civilToDate(from) } }],
          },
        }),
      ]);
      const byCause = new Map<string, number>();
      for (const d of dead)
        byCause.set(
          d.exitReason ?? "Não informada",
          (byCause.get(d.exitReason ?? "Não informada") ?? 0) + 1,
        );
      return {
        kind,
        title: "Mortalidade",
        period,
        formula:
          "Mortalidade (%) = mortes com data no período ÷ animais presentes em algum momento do período (cadastrados até o fim e sem saída antes do início).",
        coverage: null,
        columns: [
          { key: "cause", label: "Causa informada", type: "text" },
          { key: "deaths", label: "Mortes", type: "number" },
        ],
        rows: [...byCause.entries()].map(([cause, deaths]) => ({ cause, deaths })),
        totals: {
          cause: `Total · ${everActive ? R((dead.length / everActive) * 100, 2) : 0}% de ${everActive} animais`,
          deaths: dead.length,
        },
        notes: [],
      };
    }
    case "commercial": {
      const tx = await db.commercialTransaction.findMany({
        where: { farmId, voidedAt: null, date: range },
        orderBy: { date: "asc" },
      });
      const rows = tx.map((t) => ({
        date: dateToCivil(t.date),
        kind: t.kind === "sale" ? "Venda" : "Compra",
        counterparty: t.counterparty,
        heads: t.heads,
        liveKg: t.totalLiveKg == null ? null : Number(t.totalLiveKg),
        arrobas: t.estimatedArrobas == null ? null : Number(t.estimatedArrobas),
        total: Number(t.totalCents) / 100,
        perKg: t.totalLiveKg ? R(Number(t.totalCents) / 100 / Number(t.totalLiveKg)) : null,
      }));
      const sales = rows.filter((r) => r.kind === "Venda");
      const kgCovered = sales.filter((s) => s.liveKg !== null).length;
      return {
        kind,
        title: "Compras e vendas",
        period,
        formula:
          "Valores conforme a transação registrada. R$/kg = total ÷ peso vivo informado. Arrobas são ESTIMATIVA (peso vivo × rendimento informado ÷ 15), mostradas só quando houve rendimento.",
        coverage: sales.length
          ? { ...coverage(kgCovered, sales.length), note: "Vendas com peso vivo informado." }
          : null,
        columns: [
          { key: "date", label: "Data", type: "text" },
          { key: "kind", label: "Tipo", type: "text" },
          { key: "counterparty", label: "Contraparte", type: "text" },
          { key: "heads", label: "Cabeças", type: "number" },
          { key: "liveKg", label: "Peso vivo (kg)", type: "number" },
          { key: "arrobas", label: "@ estimadas", type: "number" },
          { key: "total", label: "Total (R$)", type: "money" },
          { key: "perKg", label: "R$/kg vivo", type: "money" },
        ],
        rows,
        totals: {
          date: "Total vendas",
          kind: null,
          counterparty: null,
          heads: sales.reduce((s, r) => s + r.heads, 0),
          liveKg: R(sales.reduce((s, r) => s + (r.liveKg ?? 0), 0)),
          arrobas: null,
          total: R(sales.reduce((s, r) => s + r.total, 0)),
          perKg: null,
        },
        notes: [],
      };
    }
    case "financial": {
      const entries = await db.financialEntry.findMany({
        where: { farmId, status: { not: "cancelled" } },
      });
      const paid = entries.filter(
        (e) => e.paidOn && e.paidOn >= range.gte && e.paidOn <= range.lte,
      );
      const byCat = new Map<string, { income: number; expense: number }>();
      for (const e of paid) {
        const k = CATEGORY_FIN_LABEL[e.category as EntryCategory] ?? e.category;
        const v = byCat.get(k) ?? { income: 0, expense: 0 };
        v[e.kind] += Number(e.amountCents);
        byCat.set(k, v);
      }
      const income = paid
        .filter((e) => e.kind === "income")
        .reduce((s, e) => s + Number(e.amountCents), 0);
      const expense = paid
        .filter((e) => e.kind === "expense")
        .reduce((s, e) => s + Number(e.amountCents), 0);
      const open = entries.filter((e) => e.status === "open");
      const receivable = open
        .filter((e) => e.kind === "income")
        .reduce((s, e) => s + Number(e.amountCents), 0);
      const payable = open
        .filter((e) => e.kind === "expense")
        .reduce((s, e) => s + Number(e.amountCents), 0);
      return {
        kind,
        title: "Financeiro (caixa)",
        period,
        formula:
          "Regime de caixa: lançamentos PAGOS com data de pagamento no período, por categoria. Cancelados não entram. Em aberto aparecem nas notas.",
        coverage: null,
        columns: [
          { key: "category", label: "Categoria", type: "text" },
          { key: "income", label: "Receitas (R$)", type: "money" },
          { key: "expense", label: "Despesas (R$)", type: "money" },
        ],
        rows: [...byCat.entries()].map(([category, v]) => ({
          category,
          income: v.income / 100,
          expense: v.expense / 100,
        })),
        totals: {
          category: `Saldo do período: R$ ${((income - expense) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          income: income / 100,
          expense: expense / 100,
        },
        notes: [
          `A receber em aberto: R$ ${(receivable / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          `A pagar em aberto: R$ ${(payable / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        ],
      };
    }
    case "feeding": {
      const rows = await db.feedingEvent.findMany({
        where: { farmId, voidedAt: null, date: range },
        include: { group: { select: { name: true } }, product: { select: { name: true } } },
      });
      const by = new Map<
        string,
        {
          group: string;
          diet: string;
          unit: string;
          qty: number;
          cost: number;
          costed: number;
          n: number;
        }
      >();
      for (const f of rows) {
        const key = `${f.groupId ?? "-"}|${f.productId ?? f.diet}|${f.unit}`;
        const v = by.get(key) ?? {
          group: f.group?.name ?? "Sem lote",
          diet: f.product?.name ?? f.diet,
          unit: f.unit,
          qty: 0,
          cost: 0,
          costed: 0,
          n: 0,
        };
        v.qty += Number(f.quantity);
        v.n++;
        if (f.costCents !== null) {
          v.cost += Number(f.costCents);
          v.costed++;
        }
        by.set(key, v);
      }
      const costed = rows.filter((r) => r.costCents !== null).length;
      return {
        kind,
        title: "Trato e custo de alimentação",
        period,
        formula:
          "Soma das quantidades fornecidas por lote e item. Custo = quantidade × custo médio ponderado das entradas do produto com custo informado (estimativa gerencial, não é lançamento de caixa).",
        coverage: rows.length
          ? {
              ...coverage(costed, rows.length),
              note: "Fornecimentos com custo calculável (produto com custo nas entradas).",
            }
          : null,
        columns: [
          { key: "group", label: "Lote", type: "text" },
          { key: "diet", label: "Dieta / produto", type: "text" },
          { key: "qty", label: "Quantidade", type: "number" },
          { key: "unit", label: "Unidade", type: "text" },
          { key: "cost", label: "Custo estimado (R$)", type: "money" },
        ],
        rows: [...by.values()].map((v) => ({
          group: v.group,
          diet: v.diet,
          qty: R(v.qty, 3),
          unit: v.unit,
          cost: v.costed ? v.cost / 100 : null,
        })),
        totals: null,
        notes: [],
      };
    }
    case "health": {
      const apps = await db.healthApplication.findMany({
        where: { farmId, voidedAt: null, appliedOn: range },
        select: { productName: true, unit: true, dose: true, animalId: true },
      });
      const by = new Map<
        string,
        { product: string; unit: string; applications: number; animals: Set<string>; qty: number }
      >();
      for (const a of apps) {
        const v = by.get(a.productName) ?? {
          product: a.productName,
          unit: a.unit ?? "",
          applications: 0,
          animals: new Set<string>(),
          qty: 0,
        };
        v.applications++;
        v.animals.add(a.animalId);
        v.qty += Number(a.dose ?? 0);
        by.set(a.productName, v);
      }
      return {
        kind,
        title: "Aplicações sanitárias",
        period,
        formula:
          "Aplicações não anuladas com data no período, por produto. Quantidade = soma das doses registradas.",
        coverage: null,
        columns: [
          { key: "product", label: "Produto", type: "text" },
          { key: "applications", label: "Aplicações", type: "number" },
          { key: "animals", label: "Animais", type: "number" },
          { key: "qty", label: "Quantidade", type: "number" },
          { key: "unit", label: "Unidade", type: "text" },
        ],
        rows: [...by.values()].map((v) => ({
          product: v.product,
          applications: v.applications,
          animals: v.animals.size,
          qty: R(v.qty, 3),
          unit: v.unit,
        })),
        totals: null,
        notes: [],
      };
    }
  }
}
