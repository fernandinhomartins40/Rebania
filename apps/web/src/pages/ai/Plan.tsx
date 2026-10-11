import { formatBRL } from "@rebania/domain";
import { Coins, LifeBuoy, ReceiptText } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
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
import { useSession } from "../../state/session.tsx";

interface PlanDto {
  access: { mode: "full" | "read_only"; reason: string | null };
  capacity: {
    key: string;
    limit: number | null;
    used: number;
    status: "ok" | "near" | "over" | "unlimited";
  }[];
  paymentInstructions: string | null;
  contract: {
    plan: string;
    status: string;
    implementationCents: number | null;
    monthlyCents: number | null;
    startsOn: string;
    endsOn: string | null;
    billingDay: number | null;
  } | null;
  invoices: {
    id: string;
    description: string;
    amountCents: number;
    dueOn: string;
    status: string;
    displayStatus: string;
    paymentUrl: string | null;
  }[];
}
interface AccessRequest {
  id: string;
  staffName: string;
  reason: string;
  hours: number;
  status: "pending" | "approved" | "denied" | "cancelled";
  createdAt: string;
}
const CAPACITY_LABEL: Record<string, string> = {
  farms: "Fazendas",
  activeAnimals: "Animais ativos",
  users: "Usuários",
  mediaGb: "Fotos e anexos (GB)",
};
interface CreditsDto {
  balance: number;
  purchaseAvailable: boolean;
  purchaseUnavailableReason: string | null;
  packages: { id: string; name: string; credits: number; priceCents: number }[];
  ledger: {
    id: string;
    kind: string;
    amount: number;
    balanceAfter: number;
    note: string | null;
    createdAt: string;
  }[];
}
interface Grant {
  id: string;
  reason: string;
  expiresAt: string;
  active: boolean;
  revokedAt: string | null;
}

const KIND_LABEL: Record<string, string> = {
  purchase: "Compra",
  grant: "Concessão",
  reserve: "Reserva (pergunta)",
  consume: "Consumo confirmado",
  release: "Devolução (falha)",
  refund: "Estorno",
  adjustment: "Ajuste",
};
const INVOICE_LABEL: Record<string, string> = {
  pending: "A vencer",
  overdue: "Vencida",
  paid: "Paga",
  failed: "Falhou",
  cancelled: "Cancelada",
};

/** T05 Plano + T06 Créditos: implantação, mensalidade e IA separadas; suporte com prazo. */
export function PlanPage() {
  const { farm, can } = useSession();
  const orgId = farm!.organizationId;
  const [plan, setPlan] = useState<PlanDto | null>(null);
  const [credits, setCredits] = useState<CreditsDto | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!can("org.manage")) return;
    Promise.all([
      get<PlanDto>(`/v1/orgs/${orgId}/plan`),
      get<CreditsDto>(`/v1/orgs/${orgId}/credits`),
      get<{ items: Grant[] }>(`/v1/orgs/${orgId}/support-grants`),
      get<{ items: AccessRequest[] }>(`/v1/orgs/${orgId}/support-access-requests`),
    ]).then(
      ([p, c, g, q]) => {
        setPlan(p);
        setCredits(c);
        setGrants(g.items);
        setRequests(q.items);
      },
      (e) => setError(errorMessage(e)),
    );
  }, [orgId, can, tick]);

  if (!can("org.manage"))
    return <Alert kind="info">Somente o proprietário vê plano e créditos.</Alert>;
  if (error) return <Alert kind="danger">{error}</Alert>;
  if (!plan || !credits) return <Loading />;
  return (
    <section>
      <PageHead title="Plano e créditos" back="/fazenda" />
      <div className="grid two">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>
            <ReceiptText size={22} aria-hidden="true" /> Plano
          </h2>
          {plan.contract ? (
            <div className="review">
              <dl>
                <dt>Plano</dt>
                <dd>
                  {plan.contract.plan}{" "}
                  {plan.contract.status === "suspended" ? (
                    <span className="badge badge-warn">suspenso</span>
                  ) : null}
                </dd>
                <dt>Implantação</dt>
                <dd>
                  {plan.contract.implementationCents !== null
                    ? formatBRL(plan.contract.implementationCents)
                    : "—"}
                </dd>
                <dt>Mensalidade</dt>
                <dd>
                  {plan.contract.monthlyCents !== null
                    ? formatBRL(plan.contract.monthlyCents)
                    : "—"}
                  {plan.contract.billingDay ? ` · vence todo dia ${plan.contract.billingDay}` : ""}
                </dd>
                <dt>Assistente</dt>
                <dd>Cobrado à parte, por créditos</dd>
                <dt>Vigência</dt>
                <dd>
                  desde {formatDate(plan.contract.startsOn)}
                  {plan.contract.endsOn ? ` até ${formatDate(plan.contract.endsOn)}` : ""}
                </dd>
              </dl>
            </div>
          ) : (
            <p className="hint">Contrato ainda não cadastrado pela equipe Rebania.</p>
          )}
          <p className="hint">
            Não há cobrança por cabeça nem reajuste automático pelo tamanho do rebanho.
          </p>
          {plan.capacity.some((l) => l.limit !== null) ? (
            <>
              <h3>Capacidade contratada</h3>
              <ul className="list">
                {plan.capacity
                  .filter((l) => l.limit !== null)
                  .map((l) => (
                    <li key={l.key} className="list-item">
                      <span>
                        <span className="title">{CAPACITY_LABEL[l.key] ?? l.key}</span>
                        <div className="meta">
                          {l.used} de {l.limit}
                        </div>
                      </span>
                      {l.status === "over" ? (
                        <span className="badge badge-warn">acima do contratado</span>
                      ) : l.status === "near" ? (
                        <span className="badge badge-muted">perto do limite</span>
                      ) : null}
                    </li>
                  ))}
              </ul>
              <p className="hint">
                Passar do contratado não bloqueia nada; a equipe Rebania entra em contato.
              </p>
            </>
          ) : null}
          <h3>Faturas</h3>
          {plan.paymentInstructions ? (
            <Alert kind="info">
              <strong>Como pagar:</strong>{" "}
              <span style={{ whiteSpace: "pre-wrap" }}>{plan.paymentInstructions}</span>
            </Alert>
          ) : null}
          {plan.invoices.length === 0 ? (
            <p className="hint">Nenhuma fatura.</p>
          ) : (
            <ul className="list">
              {plan.invoices.map((i) => (
                <li key={i.id} className="list-item">
                  <span>
                    <span className="title">{i.description}</span>
                    <div className="meta">
                      Vence {formatDate(i.dueOn)} · {formatBRL(i.amountCents)}
                      {i.paymentUrl && i.status !== "paid" ? (
                        <>
                          {" · "}
                          <a href={i.paymentUrl} target="_blank" rel="noreferrer">
                            Pagar
                          </a>
                        </>
                      ) : null}
                    </div>
                  </span>
                  <span
                    className={`badge ${i.displayStatus === "paid" ? "badge-ok" : i.displayStatus === "failed" || i.displayStatus === "overdue" ? "badge-danger" : "badge-muted"}`}
                  >
                    {INVOICE_LABEL[i.displayStatus] ?? i.displayStatus}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>
            <Coins size={22} aria-hidden="true" /> Créditos do assistente
          </h2>
          <p style={{ fontSize: 32, fontWeight: 800, margin: "4px 0" }}>{credits.balance}</p>
          <p className="hint">
            Sem créditos, todos os registros e relatórios continuam funcionando. Créditos não
            expiram e não há recarga automática.
          </p>
          {credits.purchaseAvailable ? (
            <ul className="list">
              {credits.packages.map((p) => (
                <li key={p.id} className="list-item">
                  <span>
                    <span className="title">{p.name}</span>
                    <div className="meta">
                      {p.credits} créditos · {formatBRL(p.priceCents)}
                    </div>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Alert kind="info">{credits.purchaseUnavailableReason}</Alert>
          )}
          <h3>Extrato</h3>
          {credits.ledger.length === 0 ? (
            <Empty title="Sem movimentação" />
          ) : (
            <ul className="list">
              {credits.ledger.slice(0, 30).map((l) => (
                <li key={l.id} className="list-item">
                  <span>
                    <span className="title">{KIND_LABEL[l.kind] ?? l.kind}</span>
                    <div className="meta">
                      {formatDateTime(l.createdAt)}
                      {l.note ? ` · ${l.note}` : ""}
                    </div>
                  </span>
                  <span>
                    {l.amount > 0 ? "+" : ""}
                    {l.amount} → {l.balanceAfter}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <SupportGrants
        orgId={orgId}
        grants={grants}
        requests={requests}
        onChange={() => setTick((n) => n + 1)}
      />
    </section>
  );
}

function SupportGrants({
  orgId,
  grants,
  requests,
  onChange,
}: {
  orgId: string;
  grants: Grant[];
  requests: AccessRequest[];
  onChange: () => void;
}) {
  const pending = requests.filter((q) => q.status === "pending");
  const decide = async (id: string, approve: boolean) => {
    await post(`/v1/orgs/${orgId}/support-access-requests/${id}/decide`, { approve });
    onChange();
  };
  const [email, setEmail] = useState("");
  const [hours, setHours] = useState("4");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await post(`/v1/orgs/${orgId}/support-grants`, {
        platformEmail: email.trim(),
        hours: Number(hours),
        reason: reason.trim(),
      });
      setEmail("");
      setReason("");
      onChange();
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>
        <LifeBuoy size={22} aria-hidden="true" /> Acesso de suporte
      </h2>
      <p className="hint">
        A equipe Rebania não vê os dados da sua fazenda. Se precisar de ajuda, conceda acesso de
        leitura com prazo; cada consulta fica registrada e você pode revogar quando quiser.
      </p>
      {pending.map((q) => (
        <Alert key={q.id} kind="warning">
          <strong>{q.staffName}</strong>, da equipe Rebania, pede acesso de leitura por {q.hours}{" "}
          hora(s).
          <br />
          Motivo: {q.reason}
          <div className="actions">
            <button className="btn btn-secondary" onClick={() => void decide(q.id, true)}>
              Liberar por {q.hours} h
            </button>
            <button className="btn btn-ghost" onClick={() => void decide(q.id, false)}>
              Recusar
            </button>
          </div>
        </Alert>
      ))}
      {grants.length ? (
        <ul className="list">
          {grants.map((g) => (
            <li key={g.id} className="list-item">
              <span>
                <span className="title">{g.reason}</span>
                <div className="meta">
                  {g.active
                    ? `Ativo até ${formatDateTime(g.expiresAt)}`
                    : g.revokedAt
                      ? "Revogado"
                      : "Expirado"}
                </div>
              </span>
              {g.active ? (
                <button
                  className="btn btn-ghost"
                  onClick={async () => {
                    await post(`/v1/orgs/${orgId}/support-grants/${g.id}/revoke`, {});
                    onChange();
                  }}
                >
                  Revogar
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={submit}>
        {error ? <Alert kind="danger">{error}</Alert> : null}
        <div className="grid two" style={{ gap: 12 }}>
          <Field id="sg-email" label="E-mail da pessoa do suporte">
            <input
              id="sg-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field id="sg-hours" label="Duração">
            <select id="sg-hours" value={hours} onChange={(e) => setHours(e.target.value)}>
              {["1", "4", "24", "72"].map((h) => (
                <option key={h} value={h}>
                  {h} hora(s)
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field id="sg-reason" label="Motivo">
          <input
            id="sg-reason"
            required
            minLength={10}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <button className="btn btn-secondary">Conceder acesso</button>
      </form>
    </div>
  );
}
