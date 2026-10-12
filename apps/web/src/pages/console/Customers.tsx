import { Search } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Empty, Field, PageHead } from "../../components/ui.tsx";
import { ImplantationButtons, ImplantationPanel, type ImplantationMode } from "./Implantation.tsx";
import { AccessBadge, brl, Loaded, StageBadge, STAGE_LABEL, useResource } from "./kit.tsx";

interface CustomerRow {
  id: string;
  name: string;
  stage: string;
  accessMode: string;
  isDemo: boolean;
  city: string | null;
  state: string | null;
  accountManager: { id: string; name: string } | null;
  farms: number;
  members: number;
  activeAnimals: number;
  contract: { plan: string; status: string; monthlyCents: number | null } | null;
  openCents: number;
  overdueCents: number;
  onboarding: { done: number; total: number } | null;
  openTickets: number;
}

export function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [mode, setMode] = useState<ImplantationMode>(null);
  const qs = new URLSearchParams();
  for (const k of ["search", "stage", "access", "demo"]) {
    const v = params.get(k);
    if (v) qs.set(k, v);
  }
  const r = useResource<{ items: CustomerRow[] }>(`/v1/platform/customers?${qs}`);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  return (
    <section>
      <PageHead title="Clientes" aside={<ImplantationButtons onOpen={setMode} />} />
      <ImplantationPanel mode={mode} setMode={setMode} onChanged={r.reload} />
      <form
        className="console-filters"
        onSubmit={(e) => {
          e.preventDefault();
          set("search", search.trim());
        }}
      >
        <Field id="f-search" label="Buscar" icon={<Search size={18} aria-hidden="true" />}>
          <input
            id="f-search"
            placeholder="Nome, CPF/CNPJ ou cidade"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <Field id="f-stage" label="Estágio">
          <select
            id="f-stage"
            value={params.get("stage") ?? ""}
            onChange={(e) => set("stage", e.target.value)}
          >
            <option value="">Todos</option>
            {Object.entries(STAGE_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field id="f-access" label="Acesso">
          <select
            id="f-access"
            value={params.get("access") ?? ""}
            onChange={(e) => set("access", e.target.value)}
          >
            <option value="">Todos</option>
            <option value="full">Completo</option>
            <option value="read_only">Somente leitura</option>
          </select>
        </Field>
        <Field id="f-demo" label="Demonstração">
          <select
            id="f-demo"
            value={params.get("demo") ?? ""}
            onChange={(e) => set("demo", e.target.value)}
          >
            <option value="">Ocultar</option>
            <option value="include">Incluir</option>
            <option value="only">Só demonstração</option>
          </select>
        </Field>
        <button className="btn btn-secondary">Buscar</button>
      </form>
      <Loaded r={r}>
        {(d) =>
          d.items.length === 0 ? (
            <Empty title="Nenhum cliente encontrado" />
          ) : (
            <div className="console-table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Estágio</th>
                    <th>Plano</th>
                    <th>Mensalidade</th>
                    <th>Em atraso</th>
                    <th>Fazendas</th>
                    <th>Animais</th>
                    <th>Usuários</th>
                    <th>Chamados</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link to={`/console/clientes/${o.id}`}>{o.name}</Link>{" "}
                        {o.isDemo ? <span className="badge badge-muted">demonstração</span> : null}
                        <div className="meta">
                          {[o.city, o.state].filter(Boolean).join(" · ")}
                          {o.accountManager ? ` · ${o.accountManager.name}` : ""}
                        </div>
                      </td>
                      <td>
                        <StageBadge stage={o.stage} /> <AccessBadge mode={o.accessMode} />
                        {o.onboarding && o.stage === "onboarding" ? (
                          <div className="meta">
                            {o.onboarding.done}/{o.onboarding.total} etapas
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {o.contract ? (
                          o.contract.plan
                        ) : (
                          <span className="badge badge-warn">sem contrato</span>
                        )}
                      </td>
                      <td>{brl(o.contract?.monthlyCents)}</td>
                      <td>{o.overdueCents ? <strong>{brl(o.overdueCents)}</strong> : "—"}</td>
                      <td>{o.farms}</td>
                      <td>{o.activeAnimals}</td>
                      <td>{o.members}</td>
                      <td>{o.openTickets || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Loaded>
    </section>
  );
}
