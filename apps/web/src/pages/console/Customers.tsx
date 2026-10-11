import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { post } from "../../api/client.ts";
import { Alert, Empty, Field, PageHead } from "../../components/ui.tsx";
import {
  AccessBadge,
  brl,
  CardForm,
  Loaded,
  StageBadge,
  STAGE_LABEL,
  TIMEZONES,
  useResource,
  useStaff,
} from "./kit.tsx";

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
interface Template {
  id: string;
  name: string;
}
interface TeamLite {
  items: { userId: string; name: string }[];
}

export function CustomersPage() {
  const { can } = useStaff();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ url: string; emailQueued: boolean } | null>(null);
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
      <PageHead
        title="Clientes"
        aside={
          can("customers.write") ? (
            <button className="btn btn-soft" onClick={() => setCreating(true)}>
              <Plus size={20} aria-hidden="true" /> Nova implantação
            </button>
          ) : null
        }
      />
      {creating ? (
        <NewCustomer
          onCancel={() => setCreating(false)}
          onDone={(c) => {
            setCreated(c);
            setCreating(false);
            r.reload();
          }}
        />
      ) : null}
      {created ? (
        <Alert kind="success">
          Cliente criado.{" "}
          {created.emailQueued
            ? "O convite foi enviado por e-mail ao proprietário."
            : "O e-mail está desligado: entregue este convite ao proprietário (exibido uma única vez):"}
          {created.emailQueued ? null : <p className="secret-box">{created.url}</p>}
        </Alert>
      ) : null}
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

function NewCustomer({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: (c: { url: string; emailQueued: boolean }) => void;
}) {
  const templates = useResource<{ items: Template[] }>("/v1/platform/onboarding-templates");
  const team = useResource<TeamLite>("/v1/platform/staff");
  const [f, setF] = useState({
    orgName: "",
    farmName: "",
    ownerName: "",
    ownerEmail: "",
    timezone: "America/Sao_Paulo",
    document: "",
    phone: "",
    city: "",
    state: "",
    stage: "onboarding",
    templateId: "",
    accountManagerId: "",
  });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <CardForm
      title="Nova implantação"
      submitLabel="Criar cliente e convidar proprietário"
      onCancel={onCancel}
      onSubmit={async () => {
        const r = await post<{ acceptUrl: string; emailQueued: boolean }>(
          "/v1/platform/customers",
          {
            orgName: f.orgName,
            farmName: f.farmName,
            ownerEmail: f.ownerEmail,
            timezone: f.timezone,
            stage: f.stage,
            ...(f.ownerName ? { ownerName: f.ownerName } : {}),
            ...(f.document ? { document: f.document } : {}),
            ...(f.phone ? { phone: f.phone } : {}),
            ...(f.city ? { city: f.city } : {}),
            ...(f.state ? { state: f.state } : {}),
            ...(f.templateId ? { templateId: f.templateId } : {}),
            ...(f.accountManagerId ? { accountManagerId: f.accountManagerId } : {}),
          },
        );
        onDone({ url: r.acceptUrl, emailQueued: r.emailQueued });
      }}
    >
      <div className="grid two" style={{ gap: 12 }}>
        <Field id="n-org" label="Cliente (organização)">
          <input id="n-org" required minLength={2} value={f.orgName} onChange={up("orgName")} />
        </Field>
        <Field id="n-farm" label="Primeira fazenda">
          <input id="n-farm" required minLength={2} value={f.farmName} onChange={up("farmName")} />
        </Field>
        <Field id="n-owner" label="Nome do proprietário" hint="opcional">
          <input id="n-owner" value={f.ownerName} onChange={up("ownerName")} />
        </Field>
        <Field id="n-email" label="E-mail do proprietário">
          <input
            id="n-email"
            type="email"
            required
            value={f.ownerEmail}
            onChange={up("ownerEmail")}
          />
        </Field>
        <Field id="n-doc" label="CPF ou CNPJ" hint="opcional">
          <input id="n-doc" inputMode="numeric" value={f.document} onChange={up("document")} />
        </Field>
        <Field id="n-phone" label="Telefone" hint="opcional">
          <input id="n-phone" type="tel" value={f.phone} onChange={up("phone")} />
        </Field>
        <Field id="n-city" label="Cidade" hint="opcional">
          <input id="n-city" value={f.city} onChange={up("city")} />
        </Field>
        <Field id="n-state" label="UF" hint="opcional">
          <input id="n-state" maxLength={2} value={f.state} onChange={up("state")} />
        </Field>
        <Field id="n-tz" label="Fuso horário da fazenda">
          <select id="n-tz" value={f.timezone} onChange={up("timezone")}>
            {TIMEZONES.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </Field>
        <Field id="n-stage" label="Estágio inicial">
          <select id="n-stage" value={f.stage} onChange={up("stage")}>
            <option value="onboarding">Em implantação</option>
            <option value="lead">Negociação</option>
          </select>
        </Field>
        <Field id="n-tpl" label="Checklist de implantação">
          <select id="n-tpl" value={f.templateId} onChange={up("templateId")}>
            <option value="">Sem checklist</option>
            {templates.data?.items.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        {team.data ? (
          <Field id="n-mgr" label="Responsável na equipe">
            <select id="n-mgr" value={f.accountManagerId} onChange={up("accountManagerId")}>
              <option value="">Ninguém</option>
              {team.data.items.map((t) => (
                <option key={t.userId} value={t.userId}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
    </CardForm>
  );
}
