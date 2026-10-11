import { Fragment, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { patch, post } from "../../api/client.ts";
import { Alert, Empty, Field, formatDateTime, PageHead } from "../../components/ui.tsx";
import type { StaffLite } from "./customer-types.ts";
import {
  CHANNEL_LABEL,
  Loaded,
  PRIORITY_LABEL,
  SlaBadge,
  TicketBadge,
  useResource,
  useStaff,
} from "./kit.tsx";

interface TicketRow {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority: string;
  channel: string;
  organizationId: string;
  organizationName: string;
  assignee: { id: string; name: string } | null;
  createdAt: string;
  lastMessageAt: string;
  lastMessageBy: string | null;
  sla: { firstResponse: string; resolution: string };
}

const worst = (s: TicketRow["sla"]) =>
  s.firstResponse === "breached" || s.resolution === "breached"
    ? "breached"
    : s.firstResponse === "at_risk" || s.resolution === "at_risk"
      ? "at_risk"
      : "ok";

/** Fila de chamados com prazo por prioridade. */
export function TicketsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "active";
  const assignee = params.get("assignee") ?? "";
  const priority = params.get("priority") ?? "";
  const qs = new URLSearchParams({ status });
  if (assignee) qs.set("assignee", assignee);
  if (priority) qs.set("priority", priority);
  const r = useResource<{ items: TicketRow[] }>(`/v1/platform/tickets?${qs}`);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  return (
    <section>
      <PageHead title="Suporte" />
      <p className="hint">
        Clientes abrem chamados no app (Fazenda → Suporte). Atendimentos por WhatsApp, e-mail ou
        telefone são registrados na ficha do cliente, aba Suporte.
      </p>
      <div className="console-filters">
        <Field id="t-status" label="Situação">
          <select id="t-status" value={status} onChange={(e) => set("status", e.target.value)}>
            <option value="active">Em aberto</option>
            <option value="open">Aguardando equipe</option>
            <option value="waiting_customer">Aguardando cliente</option>
            <option value="resolved">Resolvidos</option>
            <option value="closed">Fechados</option>
          </select>
        </Field>
        <Field id="t-assignee" label="Responsável">
          <select
            id="t-assignee"
            value={assignee}
            onChange={(e) => set("assignee", e.target.value)}
          >
            <option value="">Todos</option>
            <option value="me">Meus</option>
            <option value="none">Sem responsável</option>
          </select>
        </Field>
        <Field id="t-priority" label="Prioridade">
          <select
            id="t-priority"
            value={priority}
            onChange={(e) => set("priority", e.target.value)}
          >
            <option value="">Todas</option>
            {Object.entries(PRIORITY_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Loaded r={r}>
        {(d) =>
          d.items.length === 0 ? (
            <Empty title="Nenhum chamado neste filtro" />
          ) : (
            <div className="console-table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Chamado</th>
                    <th>Cliente</th>
                    <th>Situação</th>
                    <th>Prioridade</th>
                    <th>Responsável</th>
                    <th>Última mensagem</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Link to={`/console/suporte/${t.id}`}>
                          #{t.number} {t.subject}
                        </Link>
                        <div className="meta">
                          {CHANNEL_LABEL[t.channel]} · aberto {formatDateTime(t.createdAt)}
                        </div>
                      </td>
                      <td>
                        <Link to={`/console/clientes/${t.organizationId}?aba=suporte`}>
                          {t.organizationName}
                        </Link>
                      </td>
                      <td>
                        <TicketBadge status={t.status} /> <SlaBadge state={worst(t.sla)} />
                      </td>
                      <td>{PRIORITY_LABEL[t.priority]}</td>
                      <td>
                        {t.assignee?.name ?? <span className="badge badge-warn">ninguém</span>}
                      </td>
                      <td>
                        {formatDateTime(t.lastMessageAt)}
                        <div className="meta">
                          {t.lastMessageBy === "customer"
                            ? "do cliente"
                            : t.lastMessageBy === "staff"
                              ? "da equipe"
                              : ""}
                        </div>
                      </td>
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

interface TicketDto {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority: string;
  channel: string;
  organization: { id: string; name: string; accessMode: string };
  openedBy: string | null;
  assignee: { id: string; name: string } | null;
  createdAt: string;
  firstResponseDueAt: string;
  resolutionDueAt: string;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  sla: { firstResponse: string; resolution: string };
  messages: {
    id: string;
    authorKind: "customer" | "staff" | "system";
    authorName: string | null;
    body: string;
    internal: boolean;
    channel: string | null;
    createdAt: string;
  }[];
  accessRequests: { id: string; status: string; hours: number; reason: string }[];
}

const SLA_TEXT: Record<string, string> = {
  met: "cumprido",
  ok: "no prazo",
  at_risk: "perto de vencer",
  breached: "estourado",
};

export function TicketPage() {
  const { id } = useParams();
  const { can } = useStaff();
  const manage = can("support.manage");
  const r = useResource<TicketDto>(`/v1/platform/tickets/${id}`);
  const staff = useResource<{ items: StaffLite[] }>("/v1/platform/staff");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"reply" | "internal" | "customer">("reply");
  const [error, setError] = useState<string | null>(null);
  const update = async (data: Record<string, unknown>) => {
    await patch(`/v1/platform/tickets/${id}`, data);
    r.reload();
  };
  return (
    <section>
      <Loaded r={r}>
        {(t) => (
          <>
            <PageHead
              title={`#${t.number} ${t.subject}`}
              back="/console/suporte"
              aside={<TicketBadge status={t.status} />}
            />
            <div className="grid dash">
              <div>
                <ul className="thread">
                  {t.messages.map((m) => (
                    <li
                      key={m.id}
                      className={
                        m.authorKind === "system"
                          ? "system"
                          : `${m.authorKind}${m.internal ? " internal" : ""}`
                      }
                    >
                      {m.authorKind === "system" ? (
                        <>
                          {m.body} · {formatDateTime(m.createdAt)}
                        </>
                      ) : (
                        <>
                          <div className="who">
                            {m.authorKind === "staff"
                              ? `${m.authorName ?? "Equipe"} (equipe)`
                              : (m.authorName ?? t.organization.name)}
                            {m.internal ? " · nota interna" : ""}
                            {m.channel && m.channel !== "app"
                              ? ` · via ${CHANNEL_LABEL[m.channel]}`
                              : ""}{" "}
                            · {formatDateTime(m.createdAt)}
                          </div>
                          <div className="body">{m.body}</div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                {manage ? (
                  <form
                    className="card"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setError(null);
                      try {
                        await post(`/v1/platform/tickets/${id}/messages`, {
                          body,
                          internal: mode === "internal",
                          fromCustomer: mode === "customer",
                        });
                        setBody("");
                        r.reload();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Erro ao enviar.");
                      }
                    }}
                  >
                    {error ? <Alert kind="danger">{error}</Alert> : null}
                    <div className="seg" role="radiogroup" aria-label="Tipo de mensagem">
                      {(
                        [
                          ["reply", "Responder ao cliente"],
                          ["internal", "Nota interna"],
                          ["customer", "Registrar fala do cliente"],
                        ] as const
                      ).map(([k, l]) => (
                        <label key={k}>
                          <input
                            type="radio"
                            name="mode"
                            checked={mode === k}
                            onChange={() => setMode(k)}
                          />
                          {l}
                        </label>
                      ))}
                    </div>
                    <Field
                      id="tk-body"
                      label={
                        mode === "reply"
                          ? "Resposta"
                          : mode === "internal"
                            ? "Nota (só a equipe vê)"
                            : "O que o cliente disse"
                      }
                    >
                      <textarea
                        id="tk-body"
                        rows={4}
                        required
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                      />
                    </Field>
                    <button className="btn btn-primary">
                      {mode === "reply" ? "Enviar resposta" : "Registrar"}
                    </button>
                  </form>
                ) : null}
              </div>

              <div className="card">
                <div className="review">
                  <dl>
                    <dt>Cliente</dt>
                    <dd>
                      <Link to={`/console/clientes/${t.organization.id}?aba=suporte`}>
                        {t.organization.name}
                      </Link>
                    </dd>
                    <dt>Aberto por</dt>
                    <dd>{t.openedBy ?? `equipe (${CHANNEL_LABEL[t.channel]})`}</dd>
                    <dt>Aberto em</dt>
                    <dd>{formatDateTime(t.createdAt)}</dd>
                    <dt>1ª resposta</dt>
                    <dd>
                      até {formatDateTime(t.firstResponseDueAt)} · {SLA_TEXT[t.sla.firstResponse]}
                    </dd>
                    <dt>Solução</dt>
                    <dd>
                      até {formatDateTime(t.resolutionDueAt)} · {SLA_TEXT[t.sla.resolution]}
                    </dd>
                  </dl>
                </div>
                {manage ? (
                  <>
                    <Field id="tk-assignee" label="Responsável">
                      <select
                        id="tk-assignee"
                        value={t.assignee?.id ?? ""}
                        onChange={(e) => void update({ assigneeUserId: e.target.value || null })}
                      >
                        <option value="">Ninguém</option>
                        {staff.data?.items.map((s) => (
                          <option key={s.userId} value={s.userId}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id="tk-priority" label="Prioridade" hint="muda os prazos">
                      <select
                        id="tk-priority"
                        value={t.priority}
                        onChange={(e) => void update({ priority: e.target.value })}
                      >
                        {Object.entries(PRIORITY_LABEL).map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="actions">
                      {t.status !== "resolved" && t.status !== "closed" ? (
                        <button
                          className="btn btn-secondary"
                          onClick={() => void update({ status: "resolved" })}
                        >
                          Marcar resolvido
                        </button>
                      ) : null}
                      {t.status !== "closed" ? (
                        <button
                          className="btn btn-ghost"
                          onClick={() => void update({ status: "closed" })}
                        >
                          Fechar
                        </button>
                      ) : (
                        <button
                          className="btn btn-ghost"
                          onClick={() => void update({ status: "open" })}
                        >
                          Reabrir
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="hint">
                    Responsável: {t.assignee?.name ?? "ninguém"} · Prioridade:{" "}
                    {PRIORITY_LABEL[t.priority]}
                  </p>
                )}
                <p className="hint">
                  Precisa ver dados da fazenda? Peça acesso ao proprietário na{" "}
                  <Link to={`/console/clientes/${t.organization.id}?aba=suporte`}>
                    ficha do cliente
                  </Link>
                  .
                </p>
              </div>
            </div>
          </>
        )}
      </Loaded>
    </section>
  );
}

interface SupportRead {
  farm: { name: string; timezone: string };
  animalsByStatus: Record<string, number>;
  rejectedOrConflictMutations: number;
  openTasks: number;
  grantExpiresAt: string;
}

const ANIMAL_STATUS: Record<string, string> = {
  active: "Ativos",
  sold: "Vendidos",
  dead: "Mortos",
  transferred: "Transferidos",
  culled: "Descartados",
};

/** Leitura de suporte: só com concessão ativa do proprietário; cada abertura é auditada. */
export function SupportReadPage() {
  const { id, farmId } = useParams();
  const r = useResource<SupportRead>(`/v1/platform/support/${id}/farms/${farmId}/summary`);
  return (
    <section>
      <PageHead title="Leitura de suporte" back={`/console/clientes/${id}?aba=suporte`} />
      <Alert kind="warning">
        Acesso excepcional concedido pelo proprietário. Esta consulta foi registrada na auditoria.
      </Alert>
      <Loaded r={r}>
        {(d) => (
          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: 18 }}>{d.farm.name}</h2>
            <div className="review">
              <dl>
                <dt>Fuso horário</dt>
                <dd>{d.farm.timezone}</dd>
                {Object.entries(d.animalsByStatus).map(([k, v]) => (
                  <Fragment key={k}>
                    <dt>{ANIMAL_STATUS[k] ?? k}</dt>
                    <dd>{v}</dd>
                  </Fragment>
                ))}
                <dt>Sincronizações rejeitadas ou em conflito</dt>
                <dd>{d.rejectedOrConflictMutations}</dd>
                <dt>Tarefas abertas</dt>
                <dd>{d.openTasks}</dd>
                <dt>Concessão válida até</dt>
                <dd>{formatDateTime(d.grantExpiresAt)}</dd>
              </dl>
            </div>
          </div>
        )}
      </Loaded>
    </section>
  );
}
