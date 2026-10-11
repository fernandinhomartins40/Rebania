import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { patch, post, put } from "../../api/client.ts";
import { Alert, Empty, Field, formatDateTime, PageHead } from "../../components/ui.tsx";
import { ACTION_LABEL } from "./Customer.tsx";
import { AlertList, type AlertDto } from "./Overview.tsx";
import { CardForm, Kpi, Loaded, ROLE_LABEL, RunButton, useResource, useStaff } from "./kit.tsx";

// ---------------------------------------------------------------- Comunicados
interface Announcement {
  id: string;
  title: string;
  body: string;
  level: "info" | "warning" | "maintenance";
  organizationIds: string[];
  startsAt: string;
  endsAt: string | null;
  archived: boolean;
  live: boolean;
}
const LEVEL: Record<string, string> = {
  info: "Informativo",
  warning: "Atenção",
  maintenance: "Manutenção",
};
const localInput = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export function AnnouncementsPage() {
  const { can } = useStaff();
  const r = useResource<{ items: Announcement[] }>("/v1/platform/announcements");
  const customers = useResource<{ items: { id: string; name: string }[] }>(
    "/v1/platform/customers?demo=include",
  );
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({
    title: "",
    body: "",
    level: "info",
    startsAt: localInput(new Date()),
    endsAt: "",
    audience: "all",
    orgIds: [] as string[],
  });
  return (
    <section>
      <PageHead
        title="Comunicados"
        aside={
          can("announcements.manage") ? (
            <button className="btn btn-soft" onClick={() => setCreating(true)}>
              Novo comunicado
            </button>
          ) : null
        }
      />
      <p className="hint">
        Aparecem como faixa no topo do app dos clientes enquanto estiverem no ar.
      </p>
      {creating ? (
        <CardForm
          title="Novo comunicado"
          submitLabel="Publicar"
          onCancel={() => setCreating(false)}
          onSubmit={async () => {
            await post("/v1/platform/announcements", {
              title: f.title,
              body: f.body,
              level: f.level,
              organizationIds: f.audience === "all" ? [] : f.orgIds,
              startsAt: new Date(f.startsAt).toISOString(),
              endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
            });
            setCreating(false);
            setF({ ...f, title: "", body: "", orgIds: [] });
            r.reload();
          }}
        >
          <Field id="an-title" label="Título">
            <input
              id="an-title"
              required
              minLength={3}
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
            />
          </Field>
          <Field id="an-body" label="Mensagem">
            <textarea
              id="an-body"
              rows={3}
              required
              minLength={3}
              value={f.body}
              onChange={(e) => setF({ ...f, body: e.target.value })}
            />
          </Field>
          <div className="grid two" style={{ gap: 12 }}>
            <Field id="an-level" label="Tipo">
              <select
                id="an-level"
                value={f.level}
                onChange={(e) => setF({ ...f, level: e.target.value })}
              >
                {Object.entries(LEVEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="an-aud" label="Para quem">
              <select
                id="an-aud"
                value={f.audience}
                onChange={(e) => setF({ ...f, audience: e.target.value })}
              >
                <option value="all">Todos os clientes</option>
                <option value="some">Clientes escolhidos</option>
              </select>
            </Field>
            <Field id="an-start" label="No ar a partir de">
              <input
                id="an-start"
                type="datetime-local"
                required
                value={f.startsAt}
                onChange={(e) => setF({ ...f, startsAt: e.target.value })}
              />
            </Field>
            <Field id="an-end" label="Até" hint="vazio = até arquivar">
              <input
                id="an-end"
                type="datetime-local"
                value={f.endsAt}
                onChange={(e) => setF({ ...f, endsAt: e.target.value })}
              />
            </Field>
          </div>
          {f.audience === "some" ? (
            <Field id="an-orgs" label="Clientes" hint="segure Ctrl para marcar vários">
              <select
                id="an-orgs"
                multiple
                required
                size={6}
                value={f.orgIds}
                onChange={(e) =>
                  setF({ ...f, orgIds: [...e.target.selectedOptions].map((o) => o.value) })
                }
              >
                {customers.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </CardForm>
      ) : null}
      <Loaded r={r}>
        {(d) =>
          d.items.length === 0 ? (
            <Empty title="Nenhum comunicado" />
          ) : (
            <ul className="list">
              {d.items.map((a) => (
                <li key={a.id} className="list-item">
                  <span>
                    <span className="title">{a.title}</span>{" "}
                    <span className={`badge ${a.live ? "badge-ok" : "badge-muted"}`}>
                      {a.live ? "no ar" : a.archived ? "arquivado" : "fora do período"}
                    </span>
                    <div>{a.body}</div>
                    <div className="meta">
                      {LEVEL[a.level]} ·{" "}
                      {a.organizationIds.length
                        ? `${a.organizationIds.length} cliente(s)`
                        : "todos os clientes"}{" "}
                      · de {formatDateTime(a.startsAt)}
                      {a.endsAt ? ` até ${formatDateTime(a.endsAt)}` : ""}
                    </div>
                  </span>
                  {can("announcements.manage") && !a.archived ? (
                    <RunButton
                      label="Arquivar"
                      run={async () => {
                        await post(`/v1/platform/announcements/${a.id}/archive`);
                        r.reload();
                      }}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )
        }
      </Loaded>
    </section>
  );
}

// ---------------------------------------------------------------- Operação
interface OpsDto {
  version: string;
  uptimeSeconds: number;
  node: string;
  databaseBytes: number;
  secretsKeyConfigured: boolean;
  mail: { enabled: boolean; fromEmail: string; apiKeyConfigured: boolean };
  jobs: {
    queued: number;
    running: number;
    oldestQueuedMinutes: number;
    failed24h: { queue: string; count: number }[];
    recentFailures: {
      id: string;
      queue: string;
      error: string | null;
      attempts: number;
      at: string | null;
    }[];
  };
  email24h: Record<string, number>;
  syncProblems24h: number;
  unprocessedPayments: number;
  stuckMedia: number;
  alerts: AlertDto[];
}
interface EmailRow {
  id: string;
  toEmail: string;
  subject: string;
  template: string;
  status: string;
  error: string | null;
  attempts: number;
  createdAt: string;
}
const EMAIL_STATUS: Record<string, [string, string]> = {
  queued: ["Na fila", "badge-info"],
  sent: ["Enviado", "badge-ok"],
  delivered: ["Entregue", "badge-ok"],
  failed: ["Falhou", "badge-danger"],
  bounced: ["Devolvido", "badge-danger"],
  skipped: ["Não enviado", "badge-muted"],
};
const duration = (s: number) =>
  s >= 86400
    ? `${Math.floor(s / 86400)} d`
    : s >= 3600
      ? `${Math.floor(s / 3600)} h`
      : `${Math.floor(s / 60)} min`;
const megabytes = (b: number) => `${(b / 1024 ** 2).toFixed(1)} MB`;

export function OperationsPage() {
  const { can } = useStaff();
  const r = useResource<OpsDto>("/v1/platform/ops");
  const [status, setStatus] = useState("");
  const emails = useResource<{ items: EmailRow[] }>(
    `/v1/platform/emails${status ? `?status=${status}` : ""}`,
  );
  return (
    <section>
      <PageHead title="Operação" />
      <Loaded r={r}>
        {(d) => (
          <>
            <h2 className="section-title">Alertas</h2>
            <AlertList alerts={d.alerts} />
            <h2 className="section-title">Sistema</h2>
            <div className="console-kpis">
              <Kpi
                label="Versão no ar"
                value={d.version.slice(0, 12)}
                hint={`API ligada há ${duration(d.uptimeSeconds)}`}
              />
              <Kpi label="Banco de dados" value={megabytes(d.databaseBytes)} />
              <Kpi
                label="Fila do worker"
                value={d.jobs.queued}
                hint={`${d.jobs.running} em execução`}
              />
              <Kpi
                label="Tarefas com falha (24 h)"
                value={d.jobs.failed24h.reduce((a, f) => a + f.count, 0)}
                hint={
                  d.jobs.failed24h.map((f) => `${f.queue}: ${f.count}`).join(" · ") || "nenhuma"
                }
              />
              <Kpi label="Sincronizações rejeitadas (24 h)" value={d.syncProblems24h} />
              <Kpi label="Pagamentos sem processar" value={d.unprocessedPayments} />
              <Kpi label="Fotos presas" value={d.stuckMedia} />
            </div>
            <p className="hint">
              Disco, memória e backups do servidor não são medidos aqui; acompanhe pelos runbooks de
              deploy e incidente.
            </p>
            {d.jobs.recentFailures.length ? (
              <>
                <h2 className="section-title">Últimas falhas do worker</h2>
                <ul className="list">
                  {d.jobs.recentFailures.map((j) => (
                    <li key={j.id} className="list-item">
                      <span>
                        <span className="title">{j.queue}</span>
                        <div className="meta">
                          {j.at ? formatDateTime(j.at) : ""} · {j.attempts} tentativa(s) ·{" "}
                          {j.error ?? "sem mensagem"}
                        </div>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </Loaded>

      <h2 className="section-title">E-mails</h2>
      <div className="console-filters">
        <Field id="em-status" label="Situação">
          <select id="em-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(EMAIL_STATUS).map(([k, [l]]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Loaded r={emails}>
        {(d) =>
          d.items.length === 0 ? (
            <Empty title="Nenhum e-mail" />
          ) : (
            <div className="console-table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Para</th>
                    <th>Assunto</th>
                    <th>Situação</th>
                    {can("settings.manage") ? <th>Ações</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((e) => {
                    const [label, cls] = EMAIL_STATUS[e.status] ?? [e.status, "badge-muted"];
                    return (
                      <tr key={e.id}>
                        <td>{formatDateTime(e.createdAt)}</td>
                        <td>{e.toEmail}</td>
                        <td>
                          {e.subject}
                          <div className="meta">{e.template}</div>
                        </td>
                        <td>
                          <span className={`badge ${cls}`}>{label}</span>
                          {e.error ? <div className="meta">{e.error}</div> : null}
                        </td>
                        {can("settings.manage") ? (
                          <td>
                            {["failed", "skipped", "bounced"].includes(e.status) ? (
                              <RunButton
                                label="Reenviar"
                                run={async () => {
                                  await post(`/v1/platform/emails/${e.id}/retry`);
                                  emails.reload();
                                }}
                              />
                            ) : (
                              "—"
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </Loaded>
    </section>
  );
}

// ---------------------------------------------------------------- Auditoria
interface AuditRow {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  organizationId: string | null;
  organizationName: string | null;
  actor: { name: string; email: string; staff: boolean } | null;
  ip: string | null;
}

export function AuditPage() {
  const [params, setParams] = useSearchParams();
  const qs = new URLSearchParams();
  for (const k of ["orgId", "action", "staffOnly"]) {
    const v = params.get(k);
    if (v) qs.set(k, v);
  }
  const from = params.get("from");
  const to = params.get("to");
  if (from) qs.set("from", new Date(`${from}T00:00:00`).toISOString());
  if (to) qs.set("to", new Date(`${to}T23:59:59`).toISOString());
  const r = useResource<{ items: AuditRow[] }>(`/v1/platform/audit?${qs}`);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  return (
    <section>
      <PageHead
        title="Auditoria"
        aside={
          <a className="btn btn-soft" href={`/v1/platform/audit.csv?${qs}`}>
            Exportar CSV
          </a>
        }
      />
      <p className="hint">
        Registro permanente: nada aqui é editado ou apagado. Mostra os 200 mais recentes do filtro.
      </p>
      <div className="console-filters">
        <Field id="au-action" label="Ação começa com">
          <input
            id="au-action"
            placeholder="ex.: invoice. ou support."
            defaultValue={params.get("action") ?? ""}
            onBlur={(e) => set("action", e.target.value.trim())}
          />
        </Field>
        <Field id="au-from" label="De">
          <input
            id="au-from"
            type="date"
            value={from ?? ""}
            onChange={(e) => set("from", e.target.value)}
          />
        </Field>
        <Field id="au-to" label="Até">
          <input
            id="au-to"
            type="date"
            value={to ?? ""}
            onChange={(e) => set("to", e.target.value)}
          />
        </Field>
        <Field id="au-staff" label="Autor">
          <select
            id="au-staff"
            value={params.get("staffOnly") ?? ""}
            onChange={(e) => set("staffOnly", e.target.value)}
          >
            <option value="">Todos</option>
            <option value="true">Só a equipe Rebania</option>
          </select>
        </Field>
        {params.get("orgId") ? (
          <button className="btn btn-ghost" onClick={() => set("orgId", "")}>
            Tirar filtro de cliente
          </button>
        ) : null}
      </div>
      <Loaded r={r}>
        {(d) =>
          d.items.length === 0 ? (
            <Empty title="Nenhum registro" />
          ) : (
            <div className="console-table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Ação</th>
                    <th>Cliente</th>
                    <th>Autor</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((a) => (
                    <tr key={a.id}>
                      <td>{formatDateTime(a.createdAt)}</td>
                      <td>
                        {ACTION_LABEL[a.action] ?? a.action}
                        <div className="meta">{a.action}</div>
                      </td>
                      <td>
                        {a.organizationId ? (
                          <Link to={`/console/clientes/${a.organizationId}?aba=historico`}>
                            {a.organizationName}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {a.actor ? a.actor.name : "automático"}
                        <div className="meta">
                          {a.actor
                            ? `${a.actor.staff ? "equipe Rebania · " : ""}${a.actor.email}`
                            : ""}
                          {a.ip ? ` · ${a.ip}` : ""}
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

// ---------------------------------------------------------------- Equipe
interface TeamRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  mfaEnabled: boolean;
  disabled: boolean;
  lastSeenAt: string | null;
}

export function TeamPage() {
  const r = useResource<{ items: TeamRow[] }>("/v1/platform/team");
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ name: "", email: "", role: "support" });
  const [created, setCreated] = useState<{
    email: string;
    emailQueued: boolean;
    password: string | null;
  } | null>(null);
  return (
    <section>
      <PageHead
        title="Equipe"
        aside={
          <button className="btn btn-soft" onClick={() => setCreating(true)}>
            Adicionar pessoa
          </button>
        }
      />
      <p className="hint">
        Contas da equipe são separadas das contas de cliente e nunca têm fazenda. Todas usam
        verificação em duas etapas.
      </p>
      {creating ? (
        <CardForm
          title="Nova pessoa na equipe"
          submitLabel="Adicionar"
          onCancel={() => setCreating(false)}
          onSubmit={async () => {
            const res = await post<{ emailQueued: boolean; provisionalPassword: string | null }>(
              "/v1/platform/team",
              f,
            );
            setCreated({
              email: f.email,
              emailQueued: res.emailQueued,
              password: res.provisionalPassword,
            });
            setCreating(false);
            setF({ name: "", email: "", role: "support" });
            r.reload();
          }}
        >
          <div className="grid two" style={{ gap: 12 }}>
            <Field id="tm-name" label="Nome">
              <input
                id="tm-name"
                required
                minLength={2}
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
              />
            </Field>
            <Field id="tm-email" label="E-mail">
              <input
                id="tm-email"
                type="email"
                required
                value={f.email}
                onChange={(e) => setF({ ...f, email: e.target.value })}
              />
            </Field>
          </div>
          <Field id="tm-role" label="Papel">
            <select
              id="tm-role"
              value={f.role}
              onChange={(e) => setF({ ...f, role: e.target.value })}
            >
              {Object.entries(ROLE_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <ul className="hint" style={{ paddingLeft: 18, margin: 0 }}>
            <li>Administrador: tudo, inclusive equipe e configurações.</li>
            <li>Financeiro: planos, contratos, faturas e créditos.</li>
            <li>Suporte: chamados, usuários dos clientes e comunicados.</li>
            <li>Implantação: cadastro de clientes, checklist e chamados.</li>
          </ul>
        </CardForm>
      ) : null}
      {created ? (
        <Alert kind="success">
          {created.emailQueued
            ? `Enviamos a ${created.email} um link para definir a senha.`
            : created.password
              ? `E-mail desligado. Entregue a senha provisória a ${created.email} (exibida uma única vez; troca obrigatória no primeiro acesso):`
              : `${created.email} agora faz parte da equipe.`}
          {!created.emailQueued && created.password ? (
            <p className="secret-box">{created.password}</p>
          ) : null}
        </Alert>
      ) : null}
      <Loaded r={r}>
        {(d) => (
          <div className="console-table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Papel</th>
                  <th>Duas etapas</th>
                  <th>Último acesso</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((t) => (
                  <tr key={t.userId}>
                    <td>
                      {t.name}
                      <div className="meta">{t.email}</div>
                    </td>
                    <td>
                      <select
                        aria-label={`Papel de ${t.name}`}
                        value={t.role}
                        onChange={async (e) => {
                          try {
                            await patch(`/v1/platform/team/${t.userId}`, { role: e.target.value });
                          } catch (err) {
                            window.alert(
                              err instanceof Error
                                ? err.message
                                : "Não foi possível mudar o papel.",
                            );
                          }
                          r.reload();
                        }}
                      >
                        {Object.entries(ROLE_LABEL).map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={`badge ${t.mfaEnabled ? "badge-ok" : "badge-warn"}`}>
                        {t.mfaEnabled ? "ativa" : "pendente"}
                      </span>
                    </td>
                    <td>{t.lastSeenAt ? formatDateTime(t.lastSeenAt) : "Nunca"}</td>
                    <td>
                      <RunButton
                        label="Zerar duas etapas"
                        confirmText={`Zerar a verificação em duas etapas de ${t.name}? As sessões dela serão encerradas.`}
                        run={async () => {
                          await post(`/v1/platform/team/${t.userId}/reset-mfa`);
                          r.reload();
                        }}
                      />
                      <RunButton
                        label="Retirar acesso"
                        confirmText={`Retirar ${t.name} da equipe?`}
                        run={async () => {
                          await post(`/v1/platform/team/${t.userId}/revoke`);
                          r.reload();
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Loaded>
    </section>
  );
}

// ---------------------------------------------------------------- Configurações
interface SettingsDto {
  secretsKeyConfigured: boolean;
  mail: {
    enabled: boolean;
    fromEmail: string;
    fromName: string;
    replyTo: string | null;
    apiBaseUrl: string;
    teamEmail: string | null;
    apiKey: { configured: boolean; rotatedAt: string | null };
    webhookSecret: { configured: boolean; rotatedAt: string | null };
    webhookUrl: string;
  };
  billing: { paymentInstructions: string | null };
}

export function SettingsPage() {
  const r = useResource<SettingsDto>("/v1/platform/settings");
  return (
    <section>
      <PageHead title="Configurações" />
      <Loaded r={r}>{(d) => <SettingsForms d={d} reload={r.reload} />}</Loaded>
    </section>
  );
}

function SettingsForms({ d, reload }: { d: SettingsDto; reload: () => void }) {
  const [m, setM] = useState({
    enabled: d.mail.enabled,
    fromEmail: d.mail.fromEmail,
    fromName: d.mail.fromName,
    replyTo: d.mail.replyTo ?? "",
    apiBaseUrl: d.mail.apiBaseUrl,
    teamEmail: d.mail.teamEmail ?? "",
    apiKey: "",
    webhookSecret: "",
  });
  const [pay, setPay] = useState(d.billing.paymentInstructions ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  return (
    <>
      {!d.secretsKeyConfigured ? (
        <Alert kind="warning">
          O servidor está sem <code>PLATFORM_SECRETS_KEY</code>. Sem ela não dá para guardar a chave
          do VeloMail nem exigir a verificação em duas etapas da equipe. Veja o runbook de deploy.
        </Alert>
      ) : null}
      {saved ? <Alert kind="success">{saved}</Alert> : null}
      <CardForm
        title="E-mail transacional (VeloMail)"
        submitLabel="Salvar e-mail"
        onSubmit={async () => {
          const { apiKey, webhookSecret, ...rest } = m;
          await put("/v1/platform/settings/mail", {
            ...rest,
            replyTo: rest.replyTo || null,
            teamEmail: rest.teamEmail || null,
            ...(apiKey ? { apiKey } : {}),
            ...(webhookSecret ? { webhookSecret } : {}),
          });
          setM({ ...m, apiKey: "", webhookSecret: "" });
          setSaved("Configuração de e-mail salva.");
          reload();
        }}
      >
        <p className="hint">
          Convites, redefinição de senha, faturas, régua de cobrança e respostas de chamados saem
          por aqui. Desligado, tudo continua funcionando e os links aparecem no console para entrega
          manual.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={m.enabled}
            onChange={(e) => setM({ ...m, enabled: e.target.checked })}
          />{" "}
          Enviar e-mails
        </label>
        <div className="grid two" style={{ gap: 12 }}>
          <Field id="ml-from" label="Remetente (endereço)" hint="domínio verificado no VeloMail">
            <input
              id="ml-from"
              type="email"
              value={m.fromEmail}
              onChange={(e) => setM({ ...m, fromEmail: e.target.value })}
            />
          </Field>
          <Field id="ml-name" label="Nome do remetente">
            <input
              id="ml-name"
              required
              value={m.fromName}
              onChange={(e) => setM({ ...m, fromName: e.target.value })}
            />
          </Field>
          <Field id="ml-reply" label="Responder para" hint="opcional">
            <input
              id="ml-reply"
              type="email"
              value={m.replyTo}
              onChange={(e) => setM({ ...m, replyTo: e.target.value })}
            />
          </Field>
          <Field id="ml-team" label="Caixa da equipe" hint="recebe aviso de chamado novo">
            <input
              id="ml-team"
              type="email"
              value={m.teamEmail}
              onChange={(e) => setM({ ...m, teamEmail: e.target.value })}
            />
          </Field>
          <Field
            id="ml-key"
            label="Chave da API (re_…)"
            hint={
              d.mail.apiKey.configured
                ? "já configurada; preencha só para trocar"
                : "ainda não configurada"
            }
          >
            <input
              id="ml-key"
              type="password"
              autoComplete="off"
              disabled={!d.secretsKeyConfigured}
              value={m.apiKey}
              onChange={(e) => setM({ ...m, apiKey: e.target.value })}
            />
          </Field>
          <Field
            id="ml-hook"
            label="Segredo do webhook"
            hint={
              d.mail.webhookSecret.configured
                ? "já configurado; preencha só para trocar"
                : "opcional"
            }
          >
            <input
              id="ml-hook"
              type="password"
              autoComplete="off"
              disabled={!d.secretsKeyConfigured}
              value={m.webhookSecret}
              onChange={(e) => setM({ ...m, webhookSecret: e.target.value })}
            />
          </Field>
        </div>
        <Field id="ml-base" label="Endereço da API do VeloMail">
          <input
            id="ml-base"
            type="url"
            required
            value={m.apiBaseUrl}
            onChange={(e) => setM({ ...m, apiBaseUrl: e.target.value })}
          />
        </Field>
        <p className="hint">
          Webhook de entrega para cadastrar no VeloMail:{" "}
          <span className="secret-box">{d.mail.webhookUrl}</span>
        </p>
      </CardForm>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Testar envio</h2>
        <form
          className="actions"
          style={{ marginTop: 0 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await post<{ status: string | null; error: string | null }>(
              "/v1/platform/settings/mail/test",
              {
                to: testTo,
              },
            );
            setSaved(
              res.status === "queued"
                ? "E-mail de teste na fila. Acompanhe a entrega em Operação → E-mails."
                : `Não enviado: ${res.error ?? "envio desligado"}`,
            );
          }}
        >
          <input
            type="email"
            required
            aria-label="Enviar teste para"
            placeholder="voce@exemplo.com"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <button className="btn btn-secondary">Enviar teste</button>
        </form>
      </div>

      <CardForm
        title="Como o cliente paga"
        submitLabel="Salvar instruções"
        onSubmit={async () => {
          await put("/v1/platform/settings/billing", { paymentInstructions: pay.trim() || null });
          setSaved("Instruções de pagamento salvas.");
          reload();
        }}
      >
        <p className="hint">
          Não há provedor de pagamento integrado. Este texto aparece nas faturas (no app e no
          e-mail). Ex.: chave Pix e dados para transferência. Cada fatura também aceita um link
          próprio de pagamento.
        </p>
        <Field id="py-text" label="Instruções de pagamento">
          <textarea
            id="py-text"
            rows={4}
            maxLength={1000}
            value={pay}
            onChange={(e) => setPay(e.target.value)}
          />
        </Field>
      </CardForm>
      <p className="hint">
        Toda mudança feita aqui fica registrada na <Link to="/console/auditoria">Auditoria</Link>.
      </p>
    </>
  );
}
