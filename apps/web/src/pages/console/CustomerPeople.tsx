import { ROLE_LABEL as CUSTOMER_ROLE } from "@rebania/domain";
import { useState } from "react";
import { Link } from "react-router";
import { post } from "../../api/client.ts";
import { Alert, Empty, Field, formatDateTime } from "../../components/ui.tsx";
import type { CustomerDto } from "./customer-types.ts";
import {
  askReason,
  CardForm,
  CHANNEL_LABEL,
  Loaded,
  PRIORITY_LABEL,
  RunButton,
  TicketBadge,
  useResource,
  useStaff,
} from "./kit.tsx";

interface UserRow {
  userId: string;
  name: string;
  email: string;
  role: keyof typeof CUSTOMER_ROLE;
  allFarms: boolean;
  farms: number;
  disabled: boolean;
  mustChangePassword: boolean;
  lastSeenAt: string | null;
  activeSessions: number;
}

export function UsersTab({ c }: { c: CustomerDto; reload: () => void }) {
  const { can } = useStaff();
  const manage = can("customer_users.manage");
  const r = useResource<{ items: UserRow[] }>(`/v1/platform/customers/${c.id}/users`);
  const [link, setLink] = useState<string | null>(null);
  return (
    <>
      <p className="hint">
        Quem entra e sai da equipe da fazenda é decisão do proprietário. O suporte só encerra
        sessões, envia link de senha e desativa contas, sempre com motivo registrado.
      </p>
      {link ? (
        <Alert kind="success">
          E-mail desligado: entregue este link ao usuário (uso único, vale 1 hora).
          <p className="secret-box">{link}</p>
        </Alert>
      ) : null}
      <Loaded r={r}>
        {(d) =>
          d.items.length === 0 ? (
            <Empty title="Nenhum usuário ainda">O proprietário ainda não aceitou o convite.</Empty>
          ) : (
            <div className="console-table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Papel</th>
                    <th>Fazendas</th>
                    <th>Último acesso</th>
                    <th>Sessões</th>
                    {manage ? <th>Ações</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((u) => (
                    <tr key={u.userId}>
                      <td>
                        {u.name}{" "}
                        {u.disabled ? <span className="badge badge-danger">desativado</span> : null}
                        <div className="meta">{u.email}</div>
                      </td>
                      <td>{CUSTOMER_ROLE[u.role] ?? u.role}</td>
                      <td>{u.allFarms ? "Todas" : u.farms}</td>
                      <td>{u.lastSeenAt ? formatDateTime(u.lastSeenAt) : "Nunca"}</td>
                      <td>{u.activeSessions}</td>
                      {manage ? (
                        <td>
                          <RunButton
                            label="Link de senha"
                            run={async () => {
                              const reason = askReason(
                                `Motivo para enviar link de senha a ${u.name}:`,
                              );
                              if (!reason) return;
                              const res = await post<{ emailQueued: boolean; url: string | null }>(
                                `/v1/platform/users/${u.userId}/password-link`,
                                { reason },
                              );
                              if (res.emailQueued) window.alert("Link enviado por e-mail.");
                              else setLink(res.url);
                            }}
                          />
                          <RunButton
                            label="Encerrar sessões"
                            run={async () => {
                              const reason = askReason(
                                `Motivo para encerrar as sessões de ${u.name}:`,
                              );
                              if (!reason) return;
                              await post(`/v1/platform/users/${u.userId}/revoke-sessions`, {
                                reason,
                              });
                              r.reload();
                            }}
                          />
                          <RunButton
                            label={u.disabled ? "Reativar" : "Desativar"}
                            run={async () => {
                              const reason = askReason(
                                u.disabled
                                  ? `Motivo para reativar ${u.name}:`
                                  : `Motivo para desativar ${u.name} (vale para todas as organizações da pessoa):`,
                              );
                              if (!reason) return;
                              await post(
                                `/v1/platform/users/${u.userId}/${u.disabled ? "enable" : "disable"}`,
                                { reason },
                              );
                              r.reload();
                            }}
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Loaded>
    </>
  );
}

export function SupportTab({ c, reload }: { c: CustomerDto; reload: () => void }) {
  const { can } = useStaff();
  const manage = can("support.manage");
  const [registering, setRegistering] = useState(false);
  const [asking, setAsking] = useState(false);
  const [t, setT] = useState({ subject: "", body: "", channel: "whatsapp", priority: "normal" });
  const [a, setA] = useState({ reason: "", hours: "4" });
  const activeGrants = c.supportGrants.filter((g) => g.active);
  return (
    <div className="grid two">
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Chamados</h2>
        {c.tickets.length ? (
          <ul className="list">
            {c.tickets.map((x) => (
              <li key={x.id} className="list-item">
                <span>
                  <Link className="title" to={`/console/suporte/${x.id}`}>
                    #{x.number} {x.subject}
                  </Link>
                  <div className="meta">
                    {PRIORITY_LABEL[x.priority]} · {formatDateTime(x.createdAt)}
                  </div>
                </span>
                <TicketBadge status={x.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">Nenhum chamado.</p>
        )}
        {manage ? (
          registering ? (
            <CardForm
              bare
              title="Registrar atendimento de outro canal"
              submitLabel="Abrir chamado"
              onCancel={() => setRegistering(false)}
              onSubmit={async () => {
                await post(`/v1/platform/customers/${c.id}/tickets`, t);
                setRegistering(false);
                setT({ subject: "", body: "", channel: "whatsapp", priority: "normal" });
                reload();
              }}
            >
              <Field id="rt-subject" label="Assunto">
                <input
                  id="rt-subject"
                  required
                  minLength={3}
                  value={t.subject}
                  onChange={(e) => setT({ ...t, subject: e.target.value })}
                />
              </Field>
              <div className="grid two" style={{ gap: 12 }}>
                <Field id="rt-channel" label="Chegou por">
                  <select
                    id="rt-channel"
                    value={t.channel}
                    onChange={(e) => setT({ ...t, channel: e.target.value })}
                  >
                    {Object.entries(CHANNEL_LABEL)
                      .filter(([k]) => k !== "app")
                      .map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field id="rt-priority" label="Prioridade">
                  <select
                    id="rt-priority"
                    value={t.priority}
                    onChange={(e) => setT({ ...t, priority: e.target.value })}
                  >
                    {Object.entries(PRIORITY_LABEL).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field id="rt-body" label="O que o cliente pediu">
                <textarea
                  id="rt-body"
                  rows={4}
                  required
                  minLength={2}
                  value={t.body}
                  onChange={(e) => setT({ ...t, body: e.target.value })}
                />
              </Field>
            </CardForm>
          ) : (
            <button className="btn btn-ghost" onClick={() => setRegistering(true)}>
              Registrar atendimento (WhatsApp, e-mail, telefone)
            </button>
          )
        ) : null}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Acesso aos dados da fazenda</h2>
        <p className="hint">
          A equipe não vê dados do rebanho. O proprietário concede leitura por prazo; cada consulta
          fica registrada.
        </p>
        {activeGrants.length ? (
          <ul className="list">
            {activeGrants.map((g) => (
              <li key={g.id} className="list-item">
                <span>
                  <span className="title">Concedido a {g.platformUserName}</span>
                  <div className="meta">
                    até {formatDateTime(g.expiresAt)} · {g.reason}
                  </div>
                  <div className="meta">
                    {c.farms
                      .filter((f) => !f.archived)
                      .map((f) => (
                        <Link
                          key={f.id}
                          to={`/console/clientes/${c.id}/leitura/${f.id}`}
                          style={{ marginRight: 12 }}
                        >
                          Ver {f.name}
                        </Link>
                      ))}
                  </div>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">Nenhuma concessão ativa.</p>
        )}
        {c.accessRequests.length ? (
          <>
            <h3 style={{ fontSize: 16 }}>Pedidos feitos</h3>
            <ul className="list">
              {c.accessRequests.map((r) => (
                <li key={r.id} className="list-item">
                  <span>
                    <span className="title">
                      {r.platformUserName} · {r.hours} h
                    </span>
                    <div className="meta">
                      {formatDateTime(r.createdAt)} · {r.reason}
                    </div>
                  </span>
                  <span
                    className={`badge ${r.status === "approved" ? "badge-ok" : r.status === "pending" ? "badge-warn" : "badge-muted"}`}
                  >
                    {{
                      pending: "aguardando",
                      approved: "aprovado",
                      denied: "recusado",
                      cancelled: "cancelado",
                    }[r.status] ?? r.status}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {manage ? (
          asking ? (
            <CardForm
              bare
              title="Pedir acesso ao proprietário"
              submitLabel="Enviar pedido"
              onCancel={() => setAsking(false)}
              onSubmit={async () => {
                await post(`/v1/platform/customers/${c.id}/access-requests`, {
                  reason: a.reason,
                  hours: Number(a.hours),
                });
                setAsking(false);
                setA({ reason: "", hours: "4" });
                reload();
              }}
            >
              <Field id="ar-reason" label="Motivo" hint="o proprietário lê este texto">
                <input
                  id="ar-reason"
                  required
                  minLength={10}
                  value={a.reason}
                  onChange={(e) => setA({ ...a, reason: e.target.value })}
                />
              </Field>
              <Field id="ar-hours" label="Duração">
                <select
                  id="ar-hours"
                  value={a.hours}
                  onChange={(e) => setA({ ...a, hours: e.target.value })}
                >
                  {["1", "4", "24", "72"].map((h) => (
                    <option key={h} value={h}>
                      {h} hora(s)
                    </option>
                  ))}
                </select>
              </Field>
            </CardForm>
          ) : (
            <button className="btn btn-ghost" onClick={() => setAsking(true)}>
              Pedir acesso ao proprietário
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
