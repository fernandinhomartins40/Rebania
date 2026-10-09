import type { ReportDto } from "@rebania/contracts";
import { addDays, formatBRL, todayInTimezone, type Feature } from "@rebania/domain";
import { Download, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { errorMessage, get } from "../../api/client.ts";
import { Alert, Empty, Field, formatDate, Loading, PageHead } from "../../components/ui.tsx";
import { useSession } from "../../state/session.tsx";
import { useFeatures } from "../../state/features.ts";

const KINDS: { key: ReportDto["kind"]; label: string; finance?: boolean; feature?: Feature }[] = [
  { key: "inventory", label: "Inventário" },
  { key: "performance", label: "Desempenho (GMD)" },
  { key: "reproduction", label: "Reprodução" },
  { key: "mortality", label: "Mortalidade" },
  { key: "health", label: "Sanidade" },
  { key: "feeding", label: "Trato e custo" },
  { key: "commercial", label: "Compras e vendas", finance: true },
  { key: "financial", label: "Financeiro (caixa)", finance: true },
  { key: "result", label: "Resultado (DRE gerencial)", finance: true, feature: "result" },
  { key: "confinement", label: "Fechamento do confinamento", feature: "confinement" },
  { key: "slaughter", label: "Abate: estimado × real", finance: true, feature: "slaughter" },
  { key: "pastures", label: "Chuva", feature: "pasture" },
];

function cell(v: string | number | null | undefined, type: string) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (type === "money") return formatBRL(Math.round(v * 100));
    if (type === "percent") return `${v.toLocaleString("pt-BR")}%`;
    return v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDate(v) : v;
}

/** T39 Relatórios: fórmula, período e cobertura visíveis; CSV e impressão (PDF). */
export function ReportsPage() {
  const { farm, can } = useSession();
  const today = todayInTimezone(farm!.timezone);
  const [params, setParams] = useSearchParams();
  const kind = (params.get("r") as ReportDto["kind"]) ?? "inventory";
  const from = params.get("de") ?? addDays(today, -90);
  const to = params.get("ate") ?? today;
  const [report, setReport] = useState<ReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const features = useFeatures(farm!.id);
  const kinds = KINDS.filter(
    (k) =>
      (k.finance ? can("finance.read") : can("reports.read")) &&
      (!k.feature || features?.[k.feature]),
  );
  const url = `/v1/farms/${farm!.id}/reports/${kind}?from=${from}&to=${to}`;
  useEffect(() => {
    setReport(null);
    setError(null);
    get<ReportDto>(url).then(setReport, (e) => setError(errorMessage(e)));
  }, [url]);
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    p.set(k, v);
    setParams(p, { replace: true });
  };
  if (!kinds.length) return <Alert kind="info">Seu perfil não acessa relatórios.</Alert>;
  return (
    <section>
      <PageHead title="Relatórios" back="/fazenda" />
      <div className="card no-print">
        <div className="grid two" style={{ gap: 12 }}>
          <Field id="r-kind" label="Relatório">
            <select id="r-kind" value={kind} onChange={(e) => set("r", e.target.value)}>
              {kinds.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid two" style={{ gap: 12 }}>
            <Field id="r-from" label="De">
              <input
                id="r-from"
                type="date"
                value={from}
                max={to}
                onChange={(e) => set("de", e.target.value)}
              />
            </Field>
            <Field id="r-to" label="Até">
              <input
                id="r-to"
                type="date"
                value={to}
                min={from}
                onChange={(e) => set("ate", e.target.value)}
              />
            </Field>
          </div>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <a className="btn btn-secondary" href={`${url}&format=csv`} download>
            <Download size={20} aria-hidden="true" /> Baixar CSV
          </a>
          <button className="btn btn-ghost" onClick={() => window.print()}>
            <Printer size={20} aria-hidden="true" /> Imprimir / salvar PDF
          </button>
        </div>
      </div>
      {error ? <Alert kind="danger">{error}</Alert> : null}
      {!report && !error ? <Loading /> : null}
      {report ? (
        <article className="card report">
          <h2 style={{ marginTop: 0 }}>{report.title}</h2>
          <p className="hint">
            {farm!.name} · {formatDate(report.period.from)} a {formatDate(report.period.to)}
          </p>
          <p>
            <strong>Como é calculado:</strong> {report.formula}
          </p>
          {report.coverage ? (
            <Alert kind={report.coverage.percent < 70 ? "warning" : "info"}>
              Cobertura de dados: {report.coverage.covered} de {report.coverage.total} (
              {report.coverage.percent.toLocaleString("pt-BR")}%). {report.coverage.note}
            </Alert>
          ) : null}
          {report.rows.length === 0 ? (
            <Empty title="Sem dados no período" />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="data">
                <thead>
                  <tr>
                    {report.columns.map((c) => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r, i) => (
                    <tr key={i} style={{ cursor: "default" }}>
                      {report.columns.map((c) => (
                        <td key={c.key}>{cell(r[c.key], c.type)}</td>
                      ))}
                    </tr>
                  ))}
                  {report.totals ? (
                    <tr style={{ fontWeight: 700, cursor: "default" }}>
                      {report.columns.map((c) => (
                        <td key={c.key}>
                          {report.totals![c.key] == null ? "" : cell(report.totals![c.key], c.type)}
                        </td>
                      ))}
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
          {report.notes.length ? (
            <ul className="hint">
              {report.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
