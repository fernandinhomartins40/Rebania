import { formatBRL } from "@rebania/domain";
import { Building2, ChevronRight, Coins, Plus, ReceiptText, Settings2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { errorMessage, get, post } from "../../api/client.ts";
import {
  Alert,
  Empty,
  Field,
  formatDate,
  formatDateTime,
  Loading,
  PageHead,
} from "../../components/ui.tsx";

interface OrgRow {
  id: string;
  name: string;
  farms: number;
  members: number;
  activeAnimals: number;
  contract: { plan: string; status: string } | null;
  credits: number;
  aiQuestions30d: number;
}

/** Garante que só a equipe da plataforma vê o console (o servidor também valida). */
function useIsStaff() {
  const [staff, setStaff] = useState<boolean | null>(null);
  useEffect(() => {
    get<{ isPlatformAdmin: boolean }>("/v1/platform/me").then(
      (r) => setStaff(r.isPlatformAdmin),
      () => setStaff(false),
    );
  }, []);
  return staff;
}

function StaffOnly({ children }: { children: ReactNode }) {
  const staff = useIsStaff();
  if (staff === null) return <Loading />;
  if (!staff) return <Empty title="Página não encontrada" />;
  return <>{children}</>;
}

function Form({
  title,
  onSubmit,
  children,
  error,
}: {
  title: string;
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
  error: string | null;
}) {
  return (
    <form className="card" onSubmit={onSubmit} style={{ marginBottom: 16 }}>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>{title}</h2>
      {error ? <Alert kind="danger">{error}</Alert> : null}
      {children}
    </form>
  );
}

/** T07 Console da plataforma: área separada (não é o painel da fazenda). */
export function ConsolePage() {
  return (
    <StaffOnly>
      <ConsoleHome />
    </StaffOnly>
  );
}

function ConsoleHome() {
  const [orgs, setOrgs] = useState<OrgRow[] | null>(null);
  const [tick, setTick] = useState(0);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({
    orgName: "",
    farmName: "",
    ownerEmail: "",
    timezone: "America/Sao_Paulo",
  });
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    get<{ items: OrgRow[] }>("/v1/platform/orgs").then(
      (r) => setOrgs(r.items),
      (e) => setError(errorMessage(e)),
    );
  }, [tick]);
  if (!orgs) return error ? <Alert kind="danger">{error}</Alert> : <Loading />;
  return (
    <section>
      <PageHead
        title="Console da plataforma"
        aside={
          <button className="btn btn-soft" onClick={() => setCreating(true)}>
            <Plus size={20} aria-hidden="true" /> Implantação
          </button>
        }
      />
      <Alert kind="info">
        Área da equipe Rebania. Dados das fazendas só com concessão de suporte do proprietário.
      </Alert>
      <div className="actions" style={{ marginTop: 0 }}>
        <Link className="btn btn-ghost" to="/console/configuracao">
          <Settings2 size={20} aria-hidden="true" /> Tabela de créditos e pacotes
        </Link>
      </div>
      {creating ? (
        <Form
          title="Nova implantação (T03)"
          error={error}
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              const r = await post<{ acceptUrl: string }>("/v1/platform/orgs", f);
              setCreated(r.acceptUrl);
              setCreating(false);
              setTick((n) => n + 1);
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <div className="grid two" style={{ gap: 12 }}>
            <Field id="c-org" label="Organização (cliente)">
              <input
                id="c-org"
                required
                minLength={2}
                value={f.orgName}
                onChange={(e) => setF({ ...f, orgName: e.target.value })}
              />
            </Field>
            <Field id="c-farm" label="Primeira fazenda">
              <input
                id="c-farm"
                required
                minLength={2}
                value={f.farmName}
                onChange={(e) => setF({ ...f, farmName: e.target.value })}
              />
            </Field>
            <Field id="c-email" label="E-mail do proprietário">
              <input
                id="c-email"
                type="email"
                required
                value={f.ownerEmail}
                onChange={(e) => setF({ ...f, ownerEmail: e.target.value })}
              />
            </Field>
            <Field id="c-tz" label="Fuso horário">
              <select
                id="c-tz"
                value={f.timezone}
                onChange={(e) => setF({ ...f, timezone: e.target.value })}
              >
                {[
                  "America/Sao_Paulo",
                  "America/Cuiaba",
                  "America/Campo_Grande",
                  "America/Porto_Velho",
                  "America/Manaus",
                  "America/Rio_Branco",
                  "America/Belem",
                  "America/Araguaina",
                  "America/Bahia",
                ].map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="actions">
            <button className="btn btn-primary">Criar e gerar convite</button>
            <button type="button" className="btn btn-ghost" onClick={() => setCreating(false)}>
              Cancelar
            </button>
          </div>
        </Form>
      ) : null}
      {created ? (
        <Alert kind="success">
          Convite do proprietário (exibido uma única vez):{" "}
          <code style={{ wordBreak: "break-all" }}>{created}</code>
        </Alert>
      ) : null}
      <div style={{ overflowX: "auto" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Contrato</th>
              <th>Fazendas</th>
              <th>Animais</th>
              <th>Créditos</th>
              <th>Assistente (30 d)</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link to={`/console/org/${o.id}`}>{o.name}</Link>
                </td>
                <td>
                  {o.contract ? (
                    `${o.contract.plan}`
                  ) : (
                    <span className="badge badge-warn">sem contrato</span>
                  )}
                </td>
                <td>{o.farms}</td>
                <td>{o.activeAnimals}</td>
                <td>{o.credits}</td>
                <td>{o.aiQuestions30d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface OrgDetail {
  id: string;
  name: string;
  farms: { id: string; name: string; timezone: string }[];
  contracts: {
    id: string;
    plan: string;
    status: string;
    implementationCents: number | null;
    monthlyCents: number | null;
    startsOn: string;
  }[];
  invoices: {
    id: string;
    description: string;
    amountCents: number;
    dueOn: string;
    status: string;
  }[];
  credits: {
    balance: number;
    ledger: {
      id: string;
      kind: string;
      amount: number;
      balanceAfter: number;
      note: string | null;
      createdAt: string;
      reservationId: string | null;
    }[];
    orders: {
      id: string;
      credits: number;
      priceCents: number;
      status: string;
      createdAt: string;
    }[];
  };
  supportGrants: { id: string; reason: string; expiresAt: string; active: boolean }[];
}

export function ConsoleOrgPage() {
  return (
    <StaffOnly>
      <OrgDetailView />
    </StaffOnly>
  );
}

function OrgDetailView() {
  const { id } = useParams();
  const [o, setO] = useState<OrgDetail | null>(null);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [contract, setContract] = useState({
    plan: "",
    implementation: "",
    monthly: "",
    startsOn: new Date().toISOString().slice(0, 10),
  });
  const [invoice, setInvoice] = useState({
    description: "",
    amount: "",
    dueOn: new Date().toISOString().slice(0, 10),
  });
  const [credit, setCredit] = useState({ amount: "", reason: "" });
  useEffect(() => {
    get<OrgDetail>(`/v1/platform/orgs/${id}`).then(setO, (e) => setError(errorMessage(e)));
  }, [id, tick]);
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      setTick((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const n = (v: string) => (v.trim() ? Number(v.replace(".", "").replace(",", ".")) : null);
  if (!o) return error ? <Alert kind="danger">{error}</Alert> : <Loading />;
  return (
    <section>
      <PageHead title={o.name} back="/console" />
      {error ? <Alert kind="danger">{error}</Alert> : null}
      <p className="hint">
        <Building2 size={16} aria-hidden="true" /> {o.farms.map((f) => f.name).join(", ")}
      </p>
      <div className="grid two">
        <div>
          <Form
            title="Contrato (valores negociados)"
            error={null}
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                post(`/v1/platform/orgs/${o.id}/contracts`, {
                  plan: contract.plan,
                  implementation: n(contract.implementation),
                  monthly: n(contract.monthly),
                  startsOn: contract.startsOn,
                  status: "active",
                }),
              );
            }}
          >
            {o.contracts.map((c) => (
              <p key={c.id} className="hint">
                {c.plan} · {c.status} · implantação{" "}
                {c.implementationCents !== null ? formatBRL(c.implementationCents) : "—"} · mensal{" "}
                {c.monthlyCents !== null ? formatBRL(c.monthlyCents) : "—"} · desde{" "}
                {formatDate(c.startsOn)}
              </p>
            ))}
            <div className="grid two" style={{ gap: 12 }}>
              <Field id="k-plan" label="Plano">
                <input
                  id="k-plan"
                  required
                  value={contract.plan}
                  onChange={(e) => setContract({ ...contract, plan: e.target.value })}
                />
              </Field>
              <Field id="k-start" label="Início">
                <input
                  id="k-start"
                  type="date"
                  value={contract.startsOn}
                  onChange={(e) => setContract({ ...contract, startsOn: e.target.value })}
                />
              </Field>
              <Field id="k-impl" label="Implantação (R$)">
                <input
                  id="k-impl"
                  inputMode="decimal"
                  value={contract.implementation}
                  onChange={(e) => setContract({ ...contract, implementation: e.target.value })}
                />
              </Field>
              <Field id="k-month" label="Mensalidade (R$)">
                <input
                  id="k-month"
                  inputMode="decimal"
                  value={contract.monthly}
                  onChange={(e) => setContract({ ...contract, monthly: e.target.value })}
                />
              </Field>
            </div>
            <button className="btn btn-secondary">Ativar contrato</button>
          </Form>
          <Form
            title="Faturas"
            error={null}
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                post(`/v1/platform/orgs/${o.id}/invoices`, {
                  description: invoice.description,
                  amount: n(invoice.amount),
                  dueOn: invoice.dueOn,
                }),
              );
            }}
          >
            <ul className="list">
              {o.invoices.map((i) => (
                <li key={i.id} className="list-item">
                  <span>
                    <span className="title">
                      <ReceiptText size={16} aria-hidden="true" /> {i.description}
                    </span>
                    <div className="meta">
                      {formatDate(i.dueOn)} · {formatBRL(i.amountCents)} · {i.status}
                    </div>
                  </span>
                  {i.status === "pending" || i.status === "failed" ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() =>
                        void run(() =>
                          post(`/v1/platform/invoices/${i.id}/mark`, {
                            status: "paid",
                            note: "Baixa manual no console",
                          }),
                        )
                      }
                    >
                      Marcar paga
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="grid two" style={{ gap: 12 }}>
              <Field id="i-desc" label="Descrição">
                <input
                  id="i-desc"
                  required
                  value={invoice.description}
                  onChange={(e) => setInvoice({ ...invoice, description: e.target.value })}
                />
              </Field>
              <Field id="i-amount" label="Valor (R$)">
                <input
                  id="i-amount"
                  required
                  inputMode="decimal"
                  value={invoice.amount}
                  onChange={(e) => setInvoice({ ...invoice, amount: e.target.value })}
                />
              </Field>
              <Field id="i-due" label="Vencimento">
                <input
                  id="i-due"
                  type="date"
                  value={invoice.dueOn}
                  onChange={(e) => setInvoice({ ...invoice, dueOn: e.target.value })}
                />
              </Field>
            </div>
            <button className="btn btn-secondary">Emitir fatura</button>
          </Form>
        </div>
        <div>
          <Form
            title={`Créditos: ${o.credits.balance}`}
            error={null}
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                post(`/v1/platform/orgs/${o.id}/credits`, {
                  amount: Number(credit.amount),
                  reason: credit.reason,
                  kind: Number(credit.amount) > 0 ? "grant" : "adjustment",
                }),
              );
            }}
          >
            <div className="grid two" style={{ gap: 12 }}>
              <Field id="cr-amount" label="Quantidade (+/−)">
                <input
                  id="cr-amount"
                  required
                  inputMode="numeric"
                  value={credit.amount}
                  onChange={(e) =>
                    setCredit({ ...credit, amount: e.target.value.replace(/[^\d-]/g, "") })
                  }
                />
              </Field>
              <Field id="cr-reason" label="Motivo">
                <input
                  id="cr-reason"
                  required
                  minLength={5}
                  value={credit.reason}
                  onChange={(e) => setCredit({ ...credit, reason: e.target.value })}
                />
              </Field>
            </div>
            <button className="btn btn-secondary">
              <Coins size={18} aria-hidden="true" /> Lançar
            </button>
            <ul className="list" style={{ marginTop: 12 }}>
              {o.credits.ledger.slice(0, 30).map((l) => (
                <li key={l.id} className="list-item">
                  <span>
                    <span className="title">
                      {l.kind} {l.amount > 0 ? "+" : ""}
                      {l.amount} → {l.balanceAfter}
                    </span>
                    <div className="meta">
                      {formatDateTime(l.createdAt)}
                      {l.note ? ` · ${l.note}` : ""}
                    </div>
                  </span>
                  {l.kind === "consume" && l.reservationId ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        const reason = window.prompt("Motivo do estorno");
                        if (reason)
                          void run(() =>
                            post(`/v1/platform/reservations/${l.reservationId}/refund`, { reason }),
                          );
                      }}
                    >
                      Estornar
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Form>
          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Pedidos de créditos</h2>
            {o.credits.orders.length === 0 ? (
              <p className="hint">Nenhum pedido.</p>
            ) : (
              <ul className="list">
                {o.credits.orders.map((x) => (
                  <li key={x.id} className="list-item">
                    <span>
                      {x.credits} créditos · {formatBRL(x.priceCents)}
                    </span>
                    <span
                      className={`badge ${x.status === "paid" ? "badge-ok" : x.status === "failed" ? "badge-danger" : "badge-warn"}`}
                    >
                      {x.status === "pending" ? "pagamento pendente" : x.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <h2 style={{ fontSize: 18 }}>Acesso de suporte</h2>
            {o.supportGrants.filter((g) => g.active).length === 0 ? (
              <p className="hint">
                Sem concessão ativa. Peça ao proprietário em Fazenda → Plano e créditos.
              </p>
            ) : (
              o.supportGrants
                .filter((g) => g.active)
                .map((g) => (
                  <p key={g.id}>
                    {g.reason} · até {formatDateTime(g.expiresAt)}{" "}
                    {o.farms.map((f) => (
                      <Link key={f.id} to={`/console/org/${o.id}/suporte/${f.id}`}>
                        {f.name} <ChevronRight size={14} aria-hidden="true" />
                      </Link>
                    ))}
                  </p>
                ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ConsoleSupportPage() {
  return (
    <StaffOnly>
      <SupportView />
    </StaffOnly>
  );
}

function SupportView() {
  const { id, farmId } = useParams();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    get<Record<string, unknown>>(`/v1/platform/support/${id}/farms/${farmId}/summary`).then(
      setData,
      (e) => setError(errorMessage(e)),
    );
  }, [id, farmId]);
  return (
    <section>
      <PageHead title="Leitura de suporte" back={`/console/org/${id}`} />
      <Alert kind="warning">
        Acesso excepcional concedido pelo proprietário. Esta consulta foi registrada na auditoria.
      </Alert>
      {error ? <Alert kind="danger">{error}</Alert> : null}
      {data ? (
        <pre className="card" style={{ whiteSpace: "pre-wrap" }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : !error ? (
        <Loading />
      ) : null}
    </section>
  );
}

export function ConsoleSettingsPage() {
  return (
    <StaffOnly>
      <SettingsView />
    </StaffOnly>
  );
}

function SettingsView() {
  const [cards, setCards] = useState<
    { version: number; actions: Record<string, number>; createdAt: string }[] | null
  >(null);
  const [packages, setPackages] = useState<
    { id: string; name: string; credits: number; priceCents: number }[]
  >([]);
  const [askCost, setAskCost] = useState("");
  const [pkg, setPkg] = useState({ name: "", credits: "", price: "" });
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    get<{ items: typeof cards }>("/v1/platform/rate-cards").then(
      (r) => setCards(r.items),
      (e) => setError(errorMessage(e)),
    );
    get<{ items: typeof packages }>("/v1/platform/credit-packages").then(
      (r) => setPackages(r.items),
      () => {},
    );
  }, [tick]);
  if (!cards) return error ? <Alert kind="danger">{error}</Alert> : <Loading />;
  return (
    <section>
      <PageHead title="Créditos: tabela e pacotes" back="/console" />
      <Alert kind="warning">
        Preços e tamanhos de pacote ainda dependem de aprovação (P-01). Cadastre somente valores
        aprovados.
      </Alert>
      {error ? <Alert kind="danger">{error}</Alert> : null}
      <Form
        title="Tabela de créditos por ação"
        error={null}
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await post("/v1/platform/rate-cards", { actions: { ask: Number(askCost) } });
            setTick((n) => n + 1);
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        {cards.length ? (
          <p className="hint">
            Versão atual {cards[0]!.version}:{" "}
            {Object.entries(cards[0]!.actions)
              .map(([k, v]) => `${k} = ${v}`)
              .join(", ")}
          </p>
        ) : (
          <p className="hint">Nenhuma tabela definida: o assistente fica indisponível.</p>
        )}
        <Field id="rc-ask" label="Créditos por pergunta ao assistente">
          <input
            id="rc-ask"
            required
            inputMode="numeric"
            value={askCost}
            onChange={(e) => setAskCost(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <button className="btn btn-secondary">Publicar nova versão</button>
      </Form>
      <Form
        title="Pacotes de créditos"
        error={null}
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await post("/v1/platform/credit-packages", {
              name: pkg.name,
              credits: Number(pkg.credits),
              price: Number(pkg.price.replace(",", ".")),
            });
            setPkg({ name: "", credits: "", price: "" });
            setTick((n) => n + 1);
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        <ul className="list">
          {packages.map((p) => (
            <li key={p.id} className="list-item">
              {p.name} · {p.credits} créditos · {formatBRL(p.priceCents)}
            </li>
          ))}
        </ul>
        <div className="grid two" style={{ gap: 12 }}>
          <Field id="pk-name" label="Nome">
            <input
              id="pk-name"
              required
              value={pkg.name}
              onChange={(e) => setPkg({ ...pkg, name: e.target.value })}
            />
          </Field>
          <Field id="pk-credits" label="Créditos">
            <input
              id="pk-credits"
              required
              inputMode="numeric"
              value={pkg.credits}
              onChange={(e) => setPkg({ ...pkg, credits: e.target.value.replace(/\D/g, "") })}
            />
          </Field>
          <Field id="pk-price" label="Preço (R$)">
            <input
              id="pk-price"
              required
              inputMode="decimal"
              value={pkg.price}
              onChange={(e) => setPkg({ ...pkg, price: e.target.value })}
            />
          </Field>
        </div>
        <button className="btn btn-secondary">Cadastrar pacote</button>
      </Form>
    </section>
  );
}
