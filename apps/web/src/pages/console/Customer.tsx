import { formatTaxId } from "@rebania/domain";
import { MapPinPlus } from "lucide-react";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { patch, post } from "../../api/client.ts";
import { Alert, Empty, Field, formatDate, formatDateTime, PageHead } from "../../components/ui.tsx";
import { ContractTab, CreditsTab, InvoicesTab } from "./CustomerMoney.tsx";
import { SupportTab, UsersTab } from "./CustomerPeople.tsx";
import { AddFarmForm } from "./Implantation.tsx";
import {
  CAPACITY_LABEL,
  type CustomerDto,
  type StaffLite,
  type StepDto,
} from "./customer-types.ts";
import {
  AccessBadge,
  askReason,
  brl,
  CardForm,
  Kpi,
  Loaded,
  RunButton,
  StageBadge,
  STAGE_LABEL,
  Tabs,
  useResource,
  useStaff,
} from "./kit.tsx";

type Tab =
  | "resumo"
  | "implantacao"
  | "contrato"
  | "faturas"
  | "creditos"
  | "usuarios"
  | "suporte"
  | "contatos"
  | "historico";

/** Rótulo da ação (não do estágio): "Suspender", "Reativar"... */
function stageAction(from: string, to: string) {
  if (to === "onboarding") return "Iniciar implantação";
  if (to === "active")
    return from === "suspended" || from === "churned" ? "Reativar" : "Marcar como ativo";
  if (to === "suspended") return "Suspender";
  if (to === "churned") return "Encerrar";
  return STAGE_LABEL[to] ?? to;
}

const NEXT_STAGES: Record<string, string[]> = {
  lead: ["onboarding", "churned"],
  onboarding: ["active", "suspended", "churned"],
  active: ["suspended", "churned"],
  suspended: ["active", "churned"],
  churned: ["active"],
};

/** Ficha 360 do cliente. Dados do rebanho só por concessão de suporte do proprietário. */
export function CustomerPage() {
  const { id } = useParams();
  const { can } = useStaff();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("aba") as Tab) ?? "resumo";
  const r = useResource<CustomerDto>(`/v1/platform/customers/${id}`);
  const staff = useResource<{ items: StaffLite[] }>("/v1/platform/staff");
  return (
    <section>
      <Loaded r={r}>
        {(c) => (
          <>
            <PageHead
              title={c.name}
              back="/console/clientes"
              aside={
                <span>
                  <StageBadge stage={c.stage} /> <AccessBadge mode={c.accessMode} />
                </span>
              }
            />
            {c.accessMode === "read_only" ? (
              <Alert kind="warning">Cliente em somente leitura. {c.accessReason}</Alert>
            ) : null}
            {c.isDemo ? (
              <Alert kind="info">
                Organização de demonstração (dados fictícios): fora dos indicadores e da cobrança.
              </Alert>
            ) : null}
            <Tabs<Tab>
              value={tab}
              onChange={(t) => setParams({ aba: t }, { replace: true })}
              tabs={[
                { id: "resumo", label: "Resumo" },
                { id: "implantacao", label: "Implantação" },
                { id: "contrato", label: "Contrato" },
                { id: "faturas", label: "Faturas" },
                { id: "creditos", label: "Créditos", hidden: !can("credits.manage") },
                { id: "usuarios", label: "Usuários" },
                { id: "suporte", label: "Suporte" },
                { id: "contatos", label: "Contatos e notas" },
                { id: "historico", label: "Histórico" },
              ]}
            />
            {tab === "resumo" ? (
              <Summary c={c} staff={staff.data?.items ?? []} reload={r.reload} />
            ) : null}
            {tab === "implantacao" ? (
              <OnboardingTab c={c} staff={staff.data?.items ?? []} reload={r.reload} />
            ) : null}
            {tab === "contrato" ? <ContractTab c={c} reload={r.reload} /> : null}
            {tab === "faturas" ? <InvoicesTab c={c} reload={r.reload} /> : null}
            {tab === "creditos" ? <CreditsTab c={c} reload={r.reload} /> : null}
            {tab === "usuarios" ? <UsersTab c={c} reload={r.reload} /> : null}
            {tab === "suporte" ? <SupportTab c={c} reload={r.reload} /> : null}
            {tab === "contatos" ? <ContactsNotes c={c} reload={r.reload} /> : null}
            {tab === "historico" ? <Timeline id={c.id} /> : null}
          </>
        )}
      </Loaded>
    </section>
  );
}

function Summary({ c, staff, reload }: { c: CustomerDto; staff: StaffLite[]; reload: () => void }) {
  const { can } = useStaff();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({
    name: c.name,
    document: formatTaxId(c.document),
    phone: c.phone ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    accountManagerId: c.accountManager?.id ?? "",
  });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const active = c.contracts.find((x) => x.status === "active" || x.status === "suspended");
  const overdue = c.invoices.filter((i) => i.displayStatus === "overdue");
  const done = c.onboarding.filter((s) => s.status === "done" || s.status === "skipped").length;
  return (
    <>
      <div className="console-kpis">
        <Kpi
          label="Plano"
          value={active?.plan ?? "Sem contrato"}
          hint={`Mensalidade ${brl(c.currentMonthlyCents)}`}
        />
        <Kpi
          label="Em atraso"
          value={brl(overdue.reduce((a, i) => a + i.amountCents, 0))}
          hint={`${overdue.length} fatura(s)`}
        />
        <Kpi label="Créditos do assistente" value={c.credits.balance} />
        <Kpi
          label="Implantação"
          value={c.onboarding.length ? `${done}/${c.onboarding.length}` : "—"}
          hint="etapas concluídas"
        />
        <Kpi
          label="Última atividade"
          value={c.lastActivityAt ? formatDate(c.lastActivityAt.slice(0, 10)) : "—"}
          hint={`cliente desde ${formatDate(c.createdAt.slice(0, 10))}`}
        />
      </div>

      <FarmsCard c={c} reload={reload} />

      <div className="grid two">
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Cadastro</h2>
          {editing ? (
            <CardForm
              bare
              submitLabel="Salvar"
              onCancel={() => setEditing(false)}
              onSubmit={async () => {
                await patch(`/v1/platform/customers/${c.id}`, {
                  name: f.name,
                  document: f.document || null,
                  phone: f.phone || null,
                  city: f.city || null,
                  state: f.state || null,
                  accountManagerId: f.accountManagerId || null,
                });
                setEditing(false);
                reload();
              }}
            >
              <Field id="e-name" label="Nome">
                <input id="e-name" required value={f.name} onChange={up("name")} />
              </Field>
              <Field id="e-doc" label="CPF ou CNPJ">
                <input
                  id="e-doc"
                  inputMode="numeric"
                  value={f.document}
                  onChange={up("document")}
                />
              </Field>
              <Field id="e-phone" label="Telefone">
                <input id="e-phone" type="tel" value={f.phone} onChange={up("phone")} />
              </Field>
              <div className="grid two" style={{ gap: 12 }}>
                <Field id="e-city" label="Cidade">
                  <input id="e-city" value={f.city} onChange={up("city")} />
                </Field>
                <Field id="e-state" label="UF">
                  <input id="e-state" maxLength={2} value={f.state} onChange={up("state")} />
                </Field>
              </div>
              <Field id="e-mgr" label="Responsável na equipe">
                <select id="e-mgr" value={f.accountManagerId} onChange={up("accountManagerId")}>
                  <option value="">Ninguém</option>
                  {staff.map((s) => (
                    <option key={s.userId} value={s.userId}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </CardForm>
          ) : (
            <>
              <div className="review">
                <dl>
                  <dt>CPF/CNPJ</dt>
                  <dd>{formatTaxId(c.document) || "—"}</dd>
                  <dt>Telefone</dt>
                  <dd>{c.phone ?? "—"}</dd>
                  <dt>Local</dt>
                  <dd>{[c.city, c.state].filter(Boolean).join(" · ") || "—"}</dd>
                  <dt>Responsável</dt>
                  <dd>{c.accountManager?.name ?? "—"}</dd>
                </dl>
              </div>
              {can("customers.write") ? (
                <div className="actions">
                  <button className="btn btn-ghost" onClick={() => setEditing(true)}>
                    Editar cadastro
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Capacidade contratada × uso</h2>
          <p className="hint">
            Limites são capacidade do contrato. Nada é bloqueado nem cobrado por cabeça.
          </p>
          <ul className="list">
            {c.capacity.map((l) => (
              <li key={l.key} className="list-item">
                <span>
                  <span className="title">{CAPACITY_LABEL[l.key]}</span>
                  <div className="meta">
                    {l.used} {l.limit ? `de ${l.limit}` : "· sem limite contratado"}
                  </div>
                </span>
                {l.status === "over" ? (
                  <span className="badge badge-danger">acima do contratado</span>
                ) : l.status === "near" ? (
                  <span className="badge badge-warn">perto do limite</span>
                ) : null}
              </li>
            ))}
          </ul>
          {can("customers.write") ? (
            <>
              <h3 style={{ fontSize: 16, marginTop: 20 }}>Mudar estágio</h3>
              <div className="actions" style={{ marginTop: 0 }}>
                {(NEXT_STAGES[c.stage] ?? []).map((s) => (
                  <RunButton
                    key={s}
                    label={stageAction(c.stage, s)}
                    className={
                      s === "churned" || s === "suspended" ? "btn btn-danger" : "btn btn-secondary"
                    }
                    run={async () => {
                      const reason = askReason(`Motivo para passar a "${STAGE_LABEL[s]}":`);
                      if (!reason) return;
                      await post(`/v1/platform/customers/${c.id}/stage`, { stage: s, reason });
                      reload();
                    }}
                  />
                ))}
              </div>
              <p className="hint">Suspender ou encerrar deixa o cliente em somente leitura.</p>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

const STEP_LABEL: Record<StepDto["status"], string> = {
  todo: "A fazer",
  doing: "Em andamento",
  done: "Concluída",
  skipped: "Dispensada",
};

function OnboardingTab({
  c,
  staff,
  reload,
}: {
  c: CustomerDto;
  staff: StaffLite[];
  reload: () => void;
}) {
  const { can } = useStaff();
  const manage = can("onboarding.manage");
  const signals = useResource<{ signals: { key: string; label: string; done: boolean }[] }>(
    `/v1/platform/customers/${c.id}/onboarding`,
  );
  const templates = useResource<{ items: { id: string; name: string }[] }>(
    "/v1/platform/onboarding-templates",
  );
  const [title, setTitle] = useState("");
  const [tpl, setTpl] = useState("");
  const [invite, setInvite] = useState<{ url: string; emailQueued: boolean } | null>(null);
  const done = c.onboarding.filter((s) => s.status === "done" || s.status === "skipped").length;
  const update = async (id: string, body: Record<string, unknown>) => {
    await patch(`/v1/platform/onboarding/steps/${id}`, body);
    reload();
  };
  return (
    <div className="grid two">
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Checklist</h2>
        {c.onboarding.length ? (
          <>
            <div className="progress-bar" aria-hidden="true">
              <span style={{ width: `${(done / c.onboarding.length) * 100}%` }} />
            </div>
            <p className="hint">
              {done} de {c.onboarding.length} etapas
            </p>
            <ul className="checklist">
              {c.onboarding.map((s) => (
                <li
                  key={s.id}
                  className={s.status === "done" || s.status === "skipped" ? "done" : ""}
                >
                  <div className="grow">
                    <span className="title">{s.title}</span>
                    {s.description ? <div className="hint">{s.description}</div> : null}
                  </div>
                  {manage ? (
                    <>
                      <select
                        aria-label={`Situação de ${s.title}`}
                        value={s.status}
                        onChange={(e) => void update(s.id, { status: e.target.value })}
                      >
                        {Object.entries(STEP_LABEL).map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label={`Responsável por ${s.title}`}
                        value={s.assignee?.id ?? ""}
                        onChange={(e) =>
                          void update(s.id, { assigneeUserId: e.target.value || null })
                        }
                      >
                        <option value="">Sem responsável</option>
                        {staff.map((x) => (
                          <option key={x.userId} value={x.userId}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        aria-label={`Prazo de ${s.title}`}
                        value={s.dueOn ?? ""}
                        onChange={(e) => void update(s.id, { dueOn: e.target.value || null })}
                      />
                    </>
                  ) : (
                    <span className="hint">
                      {STEP_LABEL[s.status]}
                      {s.assignee ? ` · ${s.assignee.name}` : ""}
                      {s.dueOn ? ` · até ${formatDate(s.dueOn)}` : ""}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <Empty title="Sem checklist">Aplique um modelo ou adicione etapas.</Empty>
        )}
        {manage ? (
          <>
            <form
              className="actions"
              onSubmit={async (e) => {
                e.preventDefault();
                await post(`/v1/platform/customers/${c.id}/onboarding/steps`, { title });
                setTitle("");
                reload();
              }}
            >
              <input
                aria-label="Nova etapa"
                placeholder="Nova etapa"
                required
                minLength={2}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ flex: 1, minWidth: 180 }}
              />
              <button className="btn btn-secondary">Adicionar</button>
            </form>
            {templates.data?.items.length ? (
              <div className="actions">
                <select
                  aria-label="Modelo de checklist"
                  value={tpl}
                  onChange={(e) => setTpl(e.target.value)}
                >
                  <option value="">Aplicar modelo…</option>
                  {templates.data.items.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <RunButton
                  label="Aplicar"
                  run={async () => {
                    if (!tpl) return;
                    await post(`/v1/platform/customers/${c.id}/onboarding/apply-template`, {
                      templateId: tpl,
                    });
                    setTpl("");
                    reload();
                  }}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>O que já aconteceu no app</h2>
        <p className="hint">Medido pelo próprio sistema, sem abrir os dados da fazenda.</p>
        <ul className="list">
          {signals.data?.signals.map((s) => (
            <li key={s.key} className="list-item">
              <span className="title">{s.label}</span>
              <span className={`badge ${s.done ? "badge-ok" : "badge-muted"}`}>
                {s.done ? "sim" : "ainda não"}
              </span>
            </li>
          ))}
        </ul>
        <h3 style={{ fontSize: 16 }}>Convites pendentes</h3>
        {c.pendingInvitations.length ? (
          <ul className="list">
            {c.pendingInvitations.map((i) => (
              <li key={i.id} className="list-item">
                <span>
                  <span className="title">{i.email}</span>
                  <div className="meta">
                    {i.role === "owner" ? "Proprietário" : i.role} · expira{" "}
                    {formatDateTime(i.expiresAt)}
                  </div>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">Nenhum convite pendente.</p>
        )}
        {can("customers.write") ? (
          <RunButton
            label="Gerar novo convite do proprietário"
            run={async () => {
              const email = window.prompt(
                "E-mail do proprietário:",
                c.pendingInvitations[0]?.email ?? "",
              );
              if (!email) return;
              const r = await post<{ acceptUrl: string; emailQueued: boolean }>(
                `/v1/platform/customers/${c.id}/owner-invitation`,
                { email: email.trim() },
              );
              setInvite({ url: r.acceptUrl, emailQueued: r.emailQueued });
              reload();
            }}
          />
        ) : null}
        {invite ? (
          <Alert kind="success">
            {invite.emailQueued
              ? "Convite enviado por e-mail."
              : "E-mail desligado: entregue este link (exibido uma única vez):"}
            {invite.emailQueued ? null : <p className="secret-box">{invite.url}</p>}
          </Alert>
        ) : null}
      </div>
    </div>
  );
}

function ContactsNotes({ c, reload }: { c: CustomerDto; reload: () => void }) {
  const { can } = useStaff();
  const notes = useResource<{
    items: { id: string; body: string; author: string; createdAt: string }[];
  }>(`/v1/platform/customers/${c.id}/notes`);
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", email: "", phone: "", role: "", billing: false });
  return (
    <div className="grid two">
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Contatos</h2>
        <p className="hint">
          O contato financeiro recebe faturas e lembretes. Sem ele, vão para os proprietários.
        </p>
        {c.contacts.length ? (
          <ul className="list">
            {c.contacts.map((k) => (
              <li key={k.id} className="list-item">
                <span>
                  <span className="title">{k.name}</span>{" "}
                  {k.billing ? <span className="badge badge-info">financeiro</span> : null}
                  <div className="meta">
                    {[k.role, k.email, k.phone].filter(Boolean).join(" · ")}
                  </div>
                </span>
                {can("customers.write") ? (
                  <span>
                    <RunButton
                      label={k.billing ? "Tirar do financeiro" : "Marcar financeiro"}
                      run={async () => {
                        await patch(`/v1/platform/customers/${c.id}/contacts/${k.id}`, {
                          billing: !k.billing,
                        });
                        reload();
                      }}
                    />
                    <RunButton
                      label="Remover"
                      confirmText={`Remover o contato ${k.name}?`}
                      run={async () => {
                        await post(`/v1/platform/customers/${c.id}/contacts/${k.id}/archive`);
                        reload();
                      }}
                    />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">Nenhum contato cadastrado.</p>
        )}
        {can("customers.write") ? (
          adding ? (
            <CardForm
              bare
              submitLabel="Adicionar contato"
              onCancel={() => setAdding(false)}
              onSubmit={async () => {
                await post(`/v1/platform/customers/${c.id}/contacts`, {
                  name: f.name,
                  email: f.email || null,
                  phone: f.phone || null,
                  role: f.role || null,
                  billing: f.billing,
                });
                setF({ name: "", email: "", phone: "", role: "", billing: false });
                setAdding(false);
                reload();
              }}
            >
              <Field id="k-name" label="Nome">
                <input
                  id="k-name"
                  required
                  value={f.name}
                  onChange={(e) => setF({ ...f, name: e.target.value })}
                />
              </Field>
              <Field id="k-email" label="E-mail">
                <input
                  id="k-email"
                  type="email"
                  value={f.email}
                  onChange={(e) => setF({ ...f, email: e.target.value })}
                />
              </Field>
              <Field id="k-phone" label="Telefone">
                <input
                  id="k-phone"
                  type="tel"
                  value={f.phone}
                  onChange={(e) => setF({ ...f, phone: e.target.value })}
                />
              </Field>
              <Field id="k-role" label="Função">
                <input
                  id="k-role"
                  value={f.role}
                  onChange={(e) => setF({ ...f, role: e.target.value })}
                />
              </Field>
              <label className="check">
                <input
                  type="checkbox"
                  checked={f.billing}
                  onChange={(e) => setF({ ...f, billing: e.target.checked })}
                />{" "}
                Contato financeiro (recebe cobranças)
              </label>
            </CardForm>
          ) : (
            <button className="btn btn-ghost" onClick={() => setAdding(true)}>
              Adicionar contato
            </button>
          )
        ) : null}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Notas internas</h2>
        <p className="hint">
          Só a equipe vê. Notas não são editadas nem apagadas: corrija com outra nota.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await post(`/v1/platform/customers/${c.id}/notes`, { body: note });
            setNote("");
            notes.reload();
          }}
        >
          <Field id="note" label="Nova nota">
            <textarea
              id="note"
              rows={3}
              required
              minLength={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <button className="btn btn-secondary">Registrar nota</button>
        </form>
        <ul className="list" style={{ marginTop: 12 }}>
          {notes.data?.items.map((n) => (
            <li key={n.id} className="list-item">
              <span>
                <span style={{ whiteSpace: "pre-wrap" }}>{n.body}</span>
                <div className="meta">
                  {n.author} · {formatDateTime(n.createdAt)}
                </div>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export const ACTION_LABEL: Record<string, string> = {
  "org.bootstrapped": "Cliente criado",
  "customer.update": "Cadastro alterado",
  "customer.stage": "Estágio alterado",
  "customer.contact_add": "Contato adicionado",
  "customer.contact_update": "Contato alterado",
  "customer.contact_archive": "Contato removido",
  "contract.create": "Contrato criado",
  "contract.status": "Situação do contrato alterada",
  "contract.update": "Contrato alterado",
  "contract.amendment": "Aditivo de contrato",
  "invoice.create": "Fatura emitida",
  "invoice.issued": "Fatura emitida automaticamente",
  "invoice.update": "Fatura alterada",
  "invoice.paid": "Fatura paga (baixa)",
  "invoice.cancelled": "Fatura cancelada",
  "invoice.resend": "Fatura reenviada",
  "org.read_only": "Passou a somente leitura",
  "org.access_restored": "Acesso completo restabelecido",
  "invitation.created": "Convite criado",
  "invitation.accepted": "Convite aceito",
  "support.grant": "Acesso de suporte concedido",
  "support.revoke": "Acesso de suporte revogado",
  "support.read": "Leitura de suporte",
  "support.access_requested": "Equipe pediu acesso de suporte",
  "support.request_denied": "Pedido de acesso recusado",
  "support.sessions_revoked": "Sessões encerradas pelo suporte",
  "support.password_link": "Link de senha enviado pelo suporte",
  "support.user_disabled": "Usuário desativado pelo suporte",
  "support.user_enabled": "Usuário reativado pelo suporte",
  "ticket.registered": "Chamado registrado pela equipe",
  "ticket.update": "Chamado alterado",
  "onboarding.step_add": "Etapa de implantação adicionada",
  "onboarding.step_update": "Etapa de implantação alterada",
  "onboarding.template_applied": "Modelo de checklist aplicado",
  "billing.cycle_manual": "Ciclo de cobrança executado",
  "auth.login": "Login",
  "auth.password_changed": "Senha alterada",
  "auth.password_reset": "Senha redefinida por link",
};

function Timeline({ id }: { id: string }) {
  const r = useResource<{
    items: {
      id: string;
      action: string;
      actor: { name: string; staff: boolean } | null;
      createdAt: string;
    }[];
  }>(`/v1/platform/customers/${id}/timeline`);
  return (
    <div className="card">
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Histórico</h2>
      <p className="hint">
        Últimos 100 registros de auditoria deste cliente. Mais filtros em{" "}
        <Link to={`/console/auditoria?orgId=${id}`}>Auditoria</Link>.
      </p>
      <Loaded r={r}>
        {(d) =>
          d.items.length ? (
            <ul className="list">
              {d.items.map((e) => (
                <li key={e.id} className="list-item">
                  <span>
                    <span className="title">{ACTION_LABEL[e.action] ?? e.action}</span>
                    <div className="meta">
                      {formatDateTime(e.createdAt)} ·{" "}
                      {e.actor
                        ? `${e.actor.name}${e.actor.staff ? " (equipe Rebania)" : ""}`
                        : "automático"}
                    </div>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Sem registros" />
          )
        }
      </Loaded>
    </div>
  );
}

function FarmsCard({ c, reload }: { c: CustomerDto; reload: () => void }) {
  const { can } = useStaff();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const farms = c.farms.filter((x) => !x.archived);
  const limit = c.capacity.find((l) => l.key === "farms")?.limit ?? null;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>
        Fazendas{" "}
        <span className="hint">
          ({farms.length}
          {limit ? ` de ${limit} contratadas` : ""})
        </span>
      </h2>
      {added ? <Alert kind="success">Fazenda “{added}” adicionada.</Alert> : null}
      {farms.length ? (
        <ul className="list">
          {farms.map((x) => (
            <li key={x.id} className="list-item">
              <span>
                <span className="title">{x.name}</span>
                <div className="meta">
                  {x.timezone} · desde {formatDate(x.createdAt.slice(0, 10))}
                </div>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Nenhuma fazenda ativa.</p>
      )}
      {adding ? (
        <AddFarmForm
          customer={{ id: c.id, name: c.name, farms: farms.map((x) => x.name), farmLimit: limit }}
          onCancel={() => setAdding(false)}
          onDone={(r) => {
            setAdded(r.farm);
            setAdding(false);
            reload();
          }}
        />
      ) : can("customers.write") && c.stage !== "churned" ? (
        <div className="actions">
          <button
            className="btn btn-ghost"
            onClick={() => {
              setAdded(null);
              setAdding(true);
            }}
          >
            <MapPinPlus size={20} aria-hidden="true" /> Adicionar fazenda
          </button>
        </div>
      ) : null}
    </div>
  );
}
