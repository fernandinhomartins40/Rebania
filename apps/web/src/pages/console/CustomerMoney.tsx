import { useState } from "react";
import { post, patch } from "../../api/client.ts";
import { Alert, Empty, Field, formatDate, formatDateTime } from "../../components/ui.tsx";
import {
  CAPACITY_LABEL,
  type ContractDto,
  type CustomerDto,
  type Limits,
} from "./customer-types.ts";
import { InvoiceTable } from "./invoices.tsx";
import { askReason, brl, CardForm, RunButton, todayCivil, useResource, useStaff } from "./kit.tsx";

export interface PlanDto {
  id: string;
  code: string;
  version: number;
  name: string;
  description: string | null;
  implementationCents: number | null;
  monthlyCents: number | null;
  limits: Limits;
  archived: boolean;
  versions: number;
  activeContracts: number;
}

const reais = (v: string) =>
  v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", "."));
const toInput = (cents: number | null) =>
  cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");

export type LimitsForm = Record<keyof Limits, string>;
export const emptyLimits: LimitsForm = { farms: "", activeAnimals: "", users: "", mediaGb: "" };
export const limitsToForm = (l: Limits | null | undefined): LimitsForm => ({
  farms: l?.farms ? String(l.farms) : "",
  activeAnimals: l?.activeAnimals ? String(l.activeAnimals) : "",
  users: l?.users ? String(l.users) : "",
  mediaGb: l?.mediaGb ? String(l.mediaGb) : "",
});
export const formToLimits = (f: LimitsForm): Limits =>
  Object.fromEntries(
    Object.entries(f)
      .filter(([, v]) => v.trim() !== "" && Number(v) > 0)
      .map(([k, v]) => [k, Math.floor(Number(v))]),
  );

export function LimitsFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: LimitsForm;
  onChange: (v: LimitsForm) => void;
}) {
  return (
    <div className="grid two" style={{ gap: 12 }}>
      {(Object.keys(CAPACITY_LABEL) as (keyof Limits)[]).map((k) => (
        <Field key={k} id={`${idPrefix}-${k}`} label={CAPACITY_LABEL[k]!} hint="vazio = sem limite">
          <input
            id={`${idPrefix}-${k}`}
            inputMode="numeric"
            value={value[k]}
            onChange={(e) => onChange({ ...value, [k]: e.target.value })}
          />
        </Field>
      ))}
    </div>
  );
}

export const limitsText = (l: Limits | null | undefined) =>
  l && Object.keys(l).length
    ? (Object.keys(CAPACITY_LABEL) as (keyof Limits)[])
        .filter((k) => l[k])
        .map((k) => `${CAPACITY_LABEL[k]}: ${l[k]}`)
        .join(" · ")
    : "Sem limites contratados";

const CONTRACT_STATUS: Record<ContractDto["status"], [string, string]> = {
  draft: ["Rascunho", "badge-muted"],
  active: ["Ativo", "badge-ok"],
  suspended: ["Suspenso", "badge-warn"],
  ended: ["Encerrado", "badge-muted"],
};

export function ContractTab({ c, reload }: { c: CustomerDto; reload: () => void }) {
  const { can } = useStaff();
  const manage = can("contracts.manage");
  const [creating, setCreating] = useState(false);
  const [amending, setAmending] = useState<string | null>(null);
  const setStatus = async (id: string, status: string, ask: string) => {
    const reason = askReason(ask);
    if (!reason) return;
    await post(`/v1/platform/contracts/${id}/status`, { status, reason });
    reload();
  };
  return (
    <>
      {manage && !creating ? (
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="btn btn-soft" onClick={() => setCreating(true)}>
            Novo contrato
          </button>
        </div>
      ) : null}
      {creating ? (
        <NewContract
          orgId={c.id}
          onCancel={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            reload();
          }}
        />
      ) : null}
      {c.contracts.length === 0 && !creating ? (
        <Empty title="Sem contrato">
          Valores são os negociados; nada é cobrado sem contrato ativo.
        </Empty>
      ) : null}
      {c.contracts.map((k) => {
        const [label, cls] = CONTRACT_STATUS[k.status];
        return (
          <div className="card" key={k.id} style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>
              {k.plan} <span className={`badge ${cls}`}>{label}</span>
            </h2>
            <div className="review">
              <dl>
                <dt>Implantação</dt>
                <dd>{brl(k.implementationCents)}</dd>
                <dt>Mensalidade</dt>
                <dd>
                  {brl(k.monthlyCents)}
                  {k.billingDay ? ` · vence todo dia ${k.billingDay}` : ""}
                </dd>
                <dt>Vigência</dt>
                <dd>
                  desde {formatDate(k.startsOn)}
                  {k.endsOn ? ` até ${formatDate(k.endsOn)}` : ""}
                </dd>
                <dt>Capacidade</dt>
                <dd>{limitsText(k.limits)}</dd>
                {k.planVersion ? (
                  <>
                    <dt>Catálogo</dt>
                    <dd>versão {k.planVersion} do plano</dd>
                  </>
                ) : null}
                {k.notes ? (
                  <>
                    <dt>Observações</dt>
                    <dd>{k.notes}</dd>
                  </>
                ) : null}
              </dl>
            </div>
            {k.amendments.length ? (
              <>
                <h3 style={{ fontSize: 16 }}>Aditivos</h3>
                <ul className="list">
                  {k.amendments.map((a) => (
                    <li key={a.id} className="list-item">
                      <span>
                        <span className="title">{a.description}</span>
                        <div className="meta">
                          a partir de {formatDate(a.effectiveOn)}
                          {a.monthlyCents != null ? ` · mensalidade ${brl(a.monthlyCents)}` : ""}
                          {a.limits ? ` · ${limitsText(a.limits)}` : ""}
                        </div>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {manage && k.status !== "ended" ? (
              <div className="actions">
                {k.status === "draft" || k.status === "suspended" ? (
                  <RunButton
                    label={k.status === "draft" ? "Ativar" : "Reativar"}
                    className="btn btn-secondary"
                    run={() => setStatus(k.id, "active", "Motivo/observação da ativação:")}
                  />
                ) : null}
                {k.status === "active" ? (
                  <>
                    <button className="btn btn-ghost" onClick={() => setAmending(k.id)}>
                      Aditivo
                    </button>
                    <RunButton
                      label="Dia de vencimento"
                      run={async () => {
                        const d = window.prompt(
                          "Dia de vencimento da mensalidade (1 a 28):",
                          String(k.billingDay ?? ""),
                        );
                        if (!d) return;
                        await patch(`/v1/platform/contracts/${k.id}`, { billingDay: Number(d) });
                        reload();
                      }}
                    />
                    <RunButton
                      label="Suspender"
                      className="btn btn-danger"
                      run={() =>
                        setStatus(
                          k.id,
                          "suspended",
                          "Motivo da suspensão (o cliente fica em somente leitura):",
                        )
                      }
                    />
                  </>
                ) : null}
                <RunButton
                  label="Encerrar"
                  className="btn btn-danger"
                  run={() =>
                    setStatus(k.id, "ended", "Motivo do encerramento (não pode ser desfeito):")
                  }
                />
              </div>
            ) : null}
            {amending === k.id ? (
              <Amendment
                contract={k}
                onCancel={() => setAmending(null)}
                onDone={() => {
                  setAmending(null);
                  reload();
                }}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function NewContract({
  orgId,
  onCancel,
  onDone,
}: {
  orgId: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const plans = useResource<{ items: PlanDto[] }>("/v1/platform/plans");
  const [f, setF] = useState({
    planId: "",
    plan: "",
    implementation: "",
    monthly: "",
    startsOn: todayCivil(),
    endsOn: "",
    billingDay: "10",
    notes: "",
    activate: true,
  });
  const [limits, setLimits] = useState(emptyLimits);
  const pick = (id: string) => {
    const p = plans.data?.items.find((x) => x.id === id);
    setF({
      ...f,
      planId: id,
      plan: p?.name ?? f.plan,
      implementation: p ? toInput(p.implementationCents) : f.implementation,
      monthly: p ? toInput(p.monthlyCents) : f.monthly,
    });
    if (p) setLimits(limitsToForm(p.limits));
  };
  const available = plans.data?.items.filter((p) => !p.archived) ?? [];
  return (
    <CardForm
      title="Novo contrato"
      submitLabel={f.activate ? "Criar e ativar" : "Salvar rascunho"}
      onCancel={onCancel}
      onSubmit={async () => {
        await post(`/v1/platform/customers/${orgId}/contracts`, {
          ...(f.planId ? { planId: f.planId } : {}),
          plan: f.plan,
          implementation: reais(f.implementation),
          monthly: reais(f.monthly),
          limits: formToLimits(limits),
          billingDay: Number(f.billingDay),
          startsOn: f.startsOn,
          endsOn: f.endsOn || null,
          status: f.activate ? "active" : "draft",
          ...(f.notes ? { notes: f.notes } : {}),
        });
        onDone();
      }}
    >
      {available.length ? (
        <Field
          id="ct-cat"
          label="Plano do catálogo"
          hint="preenche os valores; ajuste se negociado"
        >
          <select id="ct-cat" value={f.planId} onChange={(e) => pick(e.target.value)}>
            <option value="">Sob medida (sem catálogo)</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Alert kind="info">
          O catálogo de planos está vazio. Você pode criar um contrato sob medida.
        </Alert>
      )}
      <div className="grid two" style={{ gap: 12 }}>
        <Field id="ct-plan" label="Nome do plano no contrato">
          <input
            id="ct-plan"
            required
            minLength={2}
            value={f.plan}
            onChange={(e) => setF({ ...f, plan: e.target.value })}
          />
        </Field>
        <Field id="ct-day" label="Dia de vencimento" hint="1 a 28">
          <input
            id="ct-day"
            type="number"
            min={1}
            max={28}
            required
            value={f.billingDay}
            onChange={(e) => setF({ ...f, billingDay: e.target.value })}
          />
        </Field>
        <Field id="ct-impl" label="Implantação (R$)" hint="vazio = sem cobrança">
          <input
            id="ct-impl"
            inputMode="decimal"
            value={f.implementation}
            onChange={(e) => setF({ ...f, implementation: e.target.value })}
          />
        </Field>
        <Field id="ct-month" label="Mensalidade (R$)" hint="vazio = sem cobrança">
          <input
            id="ct-month"
            inputMode="decimal"
            value={f.monthly}
            onChange={(e) => setF({ ...f, monthly: e.target.value })}
          />
        </Field>
        <Field id="ct-start" label="Início">
          <input
            id="ct-start"
            type="date"
            required
            value={f.startsOn}
            onChange={(e) => setF({ ...f, startsOn: e.target.value })}
          />
        </Field>
        <Field id="ct-end" label="Fim" hint="opcional">
          <input
            id="ct-end"
            type="date"
            value={f.endsOn}
            onChange={(e) => setF({ ...f, endsOn: e.target.value })}
          />
        </Field>
      </div>
      <h3 style={{ fontSize: 16 }}>Capacidade contratada</h3>
      <LimitsFields idPrefix="ct-lim" value={limits} onChange={setLimits} />
      <Field id="ct-notes" label="Observações" hint="opcional">
        <input
          id="ct-notes"
          value={f.notes}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
        />
      </Field>
      <label className="check">
        <input
          type="checkbox"
          checked={f.activate}
          onChange={(e) => setF({ ...f, activate: e.target.checked })}
        />{" "}
        Ativar agora (encerra o contrato anterior e emite a fatura de implantação)
      </label>
    </CardForm>
  );
}

function Amendment({
  contract,
  onCancel,
  onDone,
}: {
  contract: ContractDto;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [f, setF] = useState({
    description: "",
    monthly: "",
    effectiveOn: todayCivil(),
    changeLimits: false,
  });
  const [limits, setLimits] = useState(limitsToForm(contract.limits));
  return (
    <CardForm
      bare
      title="Aditivo de contrato"
      submitLabel="Registrar aditivo"
      onCancel={onCancel}
      onSubmit={async () => {
        await post(`/v1/platform/contracts/${contract.id}/amendments`, {
          description: f.description,
          monthly: reais(f.monthly),
          limits: f.changeLimits ? formToLimits(limits) : null,
          effectiveOn: f.effectiveOn,
        });
        onDone();
      }}
    >
      <p className="hint">
        O contrato original fica registrado; o aditivo vale a partir da data informada.
      </p>
      <Field id="am-desc" label="Descrição">
        <input
          id="am-desc"
          required
          minLength={3}
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
        />
      </Field>
      <div className="grid two" style={{ gap: 12 }}>
        <Field id="am-month" label="Nova mensalidade (R$)" hint="vazio = não muda">
          <input
            id="am-month"
            inputMode="decimal"
            value={f.monthly}
            onChange={(e) => setF({ ...f, monthly: e.target.value })}
          />
        </Field>
        <Field id="am-date" label="Vale a partir de">
          <input
            id="am-date"
            type="date"
            required
            value={f.effectiveOn}
            onChange={(e) => setF({ ...f, effectiveOn: e.target.value })}
          />
        </Field>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={f.changeLimits}
          onChange={(e) => setF({ ...f, changeLimits: e.target.checked })}
        />{" "}
        Mudar a capacidade contratada
      </label>
      {f.changeLimits ? (
        <LimitsFields idPrefix="am-lim" value={limits} onChange={setLimits} />
      ) : null}
    </CardForm>
  );
}

export function InvoicesTab({ c, reload }: { c: CustomerDto; reload: () => void }) {
  const { can } = useStaff();
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({
    description: "",
    amount: "",
    dueOn: todayCivil(),
    kind: "other",
    paymentUrl: "",
    notify: true,
  });
  return (
    <>
      {can("billing.manage") ? (
        creating ? (
          <CardForm
            title="Nova fatura avulsa"
            submitLabel="Emitir fatura"
            onCancel={() => setCreating(false)}
            onSubmit={async () => {
              await post(`/v1/platform/customers/${c.id}/invoices`, {
                description: f.description,
                amount: reais(f.amount),
                dueOn: f.dueOn,
                kind: f.kind,
                paymentUrl: f.paymentUrl.trim() || null,
                notify: f.notify,
              });
              setCreating(false);
              setF({ ...f, description: "", amount: "", paymentUrl: "" });
              reload();
            }}
          >
            <div className="grid two" style={{ gap: 12 }}>
              <Field id="iv-desc" label="Descrição">
                <input
                  id="iv-desc"
                  required
                  minLength={2}
                  value={f.description}
                  onChange={(e) => setF({ ...f, description: e.target.value })}
                />
              </Field>
              <Field id="iv-kind" label="Tipo">
                <select
                  id="iv-kind"
                  value={f.kind}
                  onChange={(e) => setF({ ...f, kind: e.target.value })}
                >
                  <option value="other">Avulsa</option>
                  <option value="credits">Créditos</option>
                  <option value="implementation">Implantação</option>
                  <option value="monthly">Mensalidade</option>
                </select>
              </Field>
              <Field id="iv-amount" label="Valor (R$)">
                <input
                  id="iv-amount"
                  inputMode="decimal"
                  required
                  value={f.amount}
                  onChange={(e) => setF({ ...f, amount: e.target.value })}
                />
              </Field>
              <Field id="iv-due" label="Vencimento">
                <input
                  id="iv-due"
                  type="date"
                  required
                  value={f.dueOn}
                  onChange={(e) => setF({ ...f, dueOn: e.target.value })}
                />
              </Field>
            </div>
            <Field id="iv-url" label="Link de pagamento (Pix/boleto)" hint="opcional">
              <input
                id="iv-url"
                type="url"
                value={f.paymentUrl}
                onChange={(e) => setF({ ...f, paymentUrl: e.target.value })}
              />
            </Field>
            <label className="check">
              <input
                type="checkbox"
                checked={f.notify}
                onChange={(e) => setF({ ...f, notify: e.target.checked })}
              />{" "}
              Avisar o cliente por e-mail
            </label>
          </CardForm>
        ) : (
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="btn btn-soft" onClick={() => setCreating(true)}>
              Nova fatura avulsa
            </button>
            <RunButton
              label="Rodar cobrança deste cliente agora"
              run={async () => {
                const r = await post<{ issued: number; reminders: number }>(
                  "/v1/platform/billing/run",
                  {
                    organizationId: c.id,
                  },
                );
                window.alert(`Faturas emitidas: ${r.issued}. Lembretes: ${r.reminders}.`);
                reload();
              }}
            />
          </div>
        )
      ) : null}
      <p className="hint">
        Mensalidades são emitidas automaticamente 10 dias antes do vencimento. Com mais de 15 dias
        de atraso o cliente passa a somente leitura; a baixa devolve o acesso na hora.
      </p>
      <InvoiceTable items={c.invoices} reload={reload} />
    </>
  );
}

const LEDGER_LABEL: Record<string, string> = {
  purchase: "Compra",
  grant: "Concessão",
  reserve: "Reserva (pergunta)",
  consume: "Consumo confirmado",
  release: "Devolução (falha)",
  refund: "Estorno",
  adjustment: "Ajuste",
};

export function CreditsTab({ c, reload }: { c: CustomerDto; reload: () => void }) {
  const [f, setF] = useState({ amount: "", reason: "", kind: "grant" });
  return (
    <div className="grid two">
      <div>
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Saldo</h2>
          <p style={{ fontSize: 32, fontWeight: 800, margin: "4px 0" }}>{c.credits.balance}</p>
          <p className="hint">Créditos do assistente. O saldo nunca fica negativo.</p>
        </div>
        <CardForm
          title="Conceder ou ajustar"
          submitLabel="Lançar"
          onSubmit={async () => {
            await post(`/v1/platform/customers/${c.id}/credits`, {
              amount: Number(f.amount),
              reason: f.reason,
              kind: f.kind,
            });
            setF({ amount: "", reason: "", kind: "grant" });
            reload();
          }}
        >
          <Field id="cr-kind" label="Tipo">
            <select
              id="cr-kind"
              value={f.kind}
              onChange={(e) => setF({ ...f, kind: e.target.value })}
            >
              <option value="grant">Concessão (soma)</option>
              <option value="adjustment">Ajuste (pode ser negativo)</option>
            </select>
          </Field>
          <Field id="cr-amount" label="Quantidade de créditos">
            <input
              id="cr-amount"
              type="number"
              required
              value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })}
            />
          </Field>
          <Field id="cr-reason" label="Motivo" hint="fica no extrato do cliente">
            <input
              id="cr-reason"
              required
              minLength={5}
              value={f.reason}
              onChange={(e) => setF({ ...f, reason: e.target.value })}
            />
          </Field>
        </CardForm>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Extrato</h2>
        {c.credits.ledger.length ? (
          <ul className="list">
            {c.credits.ledger.map((l) => (
              <li key={l.id} className="list-item">
                <span>
                  <span className="title">{LEDGER_LABEL[l.kind] ?? l.kind}</span>
                  <div className="meta">
                    {formatDateTime(l.createdAt)}
                    {l.note ? ` · ${l.note}` : ""}
                  </div>
                </span>
                <span>
                  {l.amount > 0 ? "+" : ""}
                  {l.amount} → {l.balanceAfter}
                  {l.kind === "consume" && l.reservationId ? (
                    <RunButton
                      label="Estornar"
                      run={async () => {
                        const reason = askReason("Motivo do estorno:", 5);
                        if (!reason) return;
                        await post(`/v1/platform/reservations/${l.reservationId}/refund`, {
                          reason,
                        });
                        reload();
                      }}
                    />
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Sem movimentação" />
        )}
      </div>
    </div>
  );
}
