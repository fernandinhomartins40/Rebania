import { Link, useSearchParams } from "react-router";
import { post } from "../../api/client.ts";
import { Alert, Empty, Field, formatDate, PageHead } from "../../components/ui.tsx";
import type { InvoiceDto } from "./customer-types.ts";
import { InvoiceTable } from "./invoices.tsx";
import { brl, INVOICE_KIND, Kpi, Loaded, RunButton, useResource, useStaff } from "./kit.tsx";

interface FinanceDto {
  mrrCents: number;
  arrCents: number;
  activeContracts: number;
  receivableCents: number;
  overdueCents: number;
  overdueCount: number;
  receivedThisMonthCents: number;
  readOnlyCustomers: number;
  debtors: { id: string; name: string; overdueCents: number; oldestDueOn: string }[];
  series: {
    month: string;
    issuedCents: number;
    receivedCents: number;
    byKind: Record<string, number>;
  }[];
}

const monthLabel = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

/** T07 Cobrança: indicadores, inadimplência, faturas de todos os clientes e recebimentos por mês. */
export function BillingPage() {
  const { can } = useStaff();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "open";
  const kind = params.get("kind") ?? "";
  const fin = useResource<FinanceDto>("/v1/platform/finance");
  const qs = new URLSearchParams({ status });
  if (kind) qs.set("kind", kind);
  const inv = useResource<{
    items: InvoiceDto[];
    totals: { count: number; amountCents: number; overdueCents: number };
  }>(`/v1/platform/invoices?${qs}`);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  return (
    <section>
      <PageHead
        title="Cobrança"
        aside={
          can("billing.manage") ? (
            <RunButton
              label="Rodar cobrança agora"
              className="btn btn-soft"
              run={async () => {
                const r = await post<{ issued: number; reminders: number; readOnly: number }>(
                  "/v1/platform/billing/run",
                  {},
                );
                window.alert(
                  `Faturas emitidas: ${r.issued}. Lembretes: ${r.reminders}. Clientes em somente leitura: ${r.readOnly}.`,
                );
                fin.reload();
                inv.reload();
              }}
            />
          ) : null
        }
      />
      <Alert kind="info">
        Cobrança manual: não há provedor de pagamento integrado. As faturas saem sozinhas, o cliente
        paga pelas instruções ou pelo link informado e a baixa é dada aqui. Instruções de pagamento
        em <Link to="/console/configuracoes">Configurações</Link>.
      </Alert>
      <Loaded r={fin}>
        {(f) => (
          <>
            <div className="console-kpis">
              <Kpi
                label="Receita recorrente mensal"
                value={brl(f.mrrCents)}
                hint={`${f.activeContracts} contrato(s) ativo(s)`}
              />
              <Kpi label="Receita recorrente anual" value={brl(f.arrCents)} />
              <Kpi label="Recebido neste mês" value={brl(f.receivedThisMonthCents)} />
              <Kpi label="A receber" value={brl(f.receivableCents)} />
              <Kpi
                label="Em atraso"
                value={brl(f.overdueCents)}
                hint={`${f.overdueCount} fatura(s)`}
              />
              <Kpi label="Clientes em somente leitura" value={f.readOnlyCustomers} />
            </div>
            <div className="grid two">
              <div className="card">
                <h2 style={{ marginTop: 0, fontSize: 18 }}>Maiores atrasos</h2>
                {f.debtors.length ? (
                  <ul className="list">
                    {f.debtors.map((d) => (
                      <li key={d.id} className="list-item">
                        <span>
                          <Link className="title" to={`/console/clientes/${d.id}?aba=faturas`}>
                            {d.name}
                          </Link>
                          <div className="meta">vencida desde {formatDate(d.oldestDueOn)}</div>
                        </span>
                        <strong>{brl(d.overdueCents)}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">Nenhum cliente em atraso.</p>
                )}
              </div>
              <div className="card">
                <h2 style={{ marginTop: 0, fontSize: 18 }}>Por mês</h2>
                {f.series.length ? (
                  <div style={{ overflowX: "auto" }}>
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Mês</th>
                          <th>Faturado (vencimento)</th>
                          <th>Recebido</th>
                          <th>Recebido por tipo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...f.series].reverse().map((s) => (
                          <tr key={s.month}>
                            <td>{monthLabel(s.month)}</td>
                            <td>{brl(s.issuedCents)}</td>
                            <td>{brl(s.receivedCents)}</td>
                            <td className="meta">
                              {Object.entries(s.byKind)
                                .map(([k, v]) => `${INVOICE_KIND[k] ?? k}: ${brl(v)}`)
                                .join(" · ") || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title="Sem faturas ainda" />
                )}
              </div>
            </div>
          </>
        )}
      </Loaded>

      <h2 className="section-title">Faturas</h2>
      <div className="console-filters">
        <Field id="b-status" label="Situação">
          <select id="b-status" value={status} onChange={(e) => set("status", e.target.value)}>
            <option value="open">Em aberto</option>
            <option value="overdue">Vencidas</option>
            <option value="pending">A vencer</option>
            <option value="paid">Pagas</option>
            <option value="cancelled">Canceladas</option>
          </select>
        </Field>
        <Field id="b-kind" label="Tipo">
          <select id="b-kind" value={kind} onChange={(e) => set("kind", e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(INVOICE_KIND).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Loaded r={inv}>
        {(d) => (
          <>
            <p className="hint">
              {d.totals.count} fatura(s) · {brl(d.totals.amountCents)}
              {d.totals.overdueCents ? ` · ${brl(d.totals.overdueCents)} em atraso` : ""}
            </p>
            <InvoiceTable
              items={d.items}
              showCustomer
              reload={() => {
                inv.reload();
                fin.reload();
              }}
            />
          </>
        )}
      </Loaded>
    </section>
  );
}
