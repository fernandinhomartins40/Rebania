import type { FinancialEntryDto, FinancialEntryInput } from "@rebania/contracts";
import {
  CATEGORY_FIN_LABEL,
  entryStatusLabel,
  EXPENSE_CATEGORIES,
  formatBRL,
  INCOME_CATEGORIES,
  todayInTimezone,
  type EntryCategory,
} from "@rebania/domain";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { errorMessage, post } from "../../api/client.ts";
import { Alert, Empty, Field, formatDate, Loading, PageHead } from "../../components/ui.tsx";
import { useCachedGet } from "../../state/cached.ts";
import { useLocalHerd } from "../../state/local-data.ts";
import { useSession } from "../../state/session.tsx";
import { num } from "./Sale.tsx";

type Tab = "aberto" | "pagos" | "cancelados";

/** T38 Financeiro: contas a pagar/receber, caixa e rateio por lote/animal. */
export function FinancePage() {
  const { farm, can } = useSession();
  const today = todayInTimezone(farm!.timezone);
  const [params, setParams] = useSearchParams();
  const tab = (params.get("aba") as Tab) ?? "aberto";
  const status = tab === "aberto" ? "open" : tab === "pagos" ? "paid" : "cancelled";
  const { data, offline, reload } = useCachedGet<{ items: FinancialEntryDto[] }>(
    `/v1/farms/${farm!.id}/finance/entries?status=${status}`,
    `finance:${farm!.id}:${status}`,
  );
  const [adding, setAdding] = useState(params.get("novo") === "1");
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<{ id: string; mode: "pay" | "cancel" } | null>(null);
  const [actValue, setActValue] = useState("");
  if (!can("finance.read")) return <Alert kind="info">Seu perfil não acessa o financeiro.</Alert>;
  if (!data)
    return offline ? <Alert kind="info">Financeiro disponível com conexão.</Alert> : <Loading />;
  const sum = (k: "income" | "expense") =>
    data.items.filter((e) => e.kind === k).reduce((s, e) => s + e.amountCents, 0);
  const write = can("finance.write");

  async function act(e: FormEvent) {
    e.preventDefault();
    if (!acting) return;
    setError(null);
    try {
      await post(
        `/v1/farms/${farm!.id}/finance/entries/${acting.id}/${acting.mode}`,
        acting.mode === "pay" ? { paidOn: actValue || today } : { reason: actValue.trim() },
      );
      setActing(null);
      setActValue("");
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section>
      <PageHead
        title="Financeiro"
        back="/fazenda"
        aside={
          write && !adding ? (
            <button className="btn btn-soft" onClick={() => setAdding(true)}>
              <Plus size={20} aria-hidden="true" /> Lançamento
            </button>
          ) : null
        }
      />
      {adding ? (
        <EntryForm
          onDone={() => {
            setAdding(false);
            reload();
          }}
        />
      ) : null}
      <div className="stats">
        <div className="stat">
          <div>
            <strong>{formatBRL(sum("income"))}</strong>
            <span>{tab === "aberto" ? "A receber" : "Receitas"}</span>
          </div>
        </div>
        <div className="stat">
          <div>
            <strong>{formatBRL(sum("expense"))}</strong>
            <span>{tab === "aberto" ? "A pagar" : "Despesas"}</span>
          </div>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {(
          [
            ["aberto", "Em aberto"],
            ["pagos", "Pagos"],
            ["cancelados", "Cancelados"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setParams({ aba: k }, { replace: true })}
          >
            {l}
          </button>
        ))}
      </div>
      {error ? <Alert kind="danger">{error}</Alert> : null}
      {data.items.length === 0 ? (
        <Empty title="Nenhum lançamento" />
      ) : (
        <ul className="list">
          {data.items.map((e) => {
            const label = entryStatusLabel(e.status, e.dueOn, today);
            return (
              <li key={e.id} className="list-item" style={{ display: "block" }}>
                <span
                  className="title"
                  style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
                >
                  <span>
                    {e.description}{" "}
                    <span
                      className={`badge ${label === "Vencido" ? "badge-danger" : label === "Pago" ? "badge-ok" : "badge-muted"}`}
                    >
                      {label}
                    </span>
                  </span>
                  <span
                    style={{
                      color: e.kind === "income" ? "var(--color-success)" : "var(--color-danger)",
                    }}
                  >
                    {e.kind === "income" ? "+" : "−"}
                    {formatBRL(e.amountCents)}
                  </span>
                </span>
                <div className="meta">
                  {CATEGORY_FIN_LABEL[e.category]} · vence {formatDate(e.dueOn)}
                  {e.paidOn ? ` · pago ${formatDate(e.paidOn)}` : ""}
                  {e.counterparty ? ` · ${e.counterparty}` : ""}
                  {e.allocationType !== "farm"
                    ? ` · rateio: ${e.allocationIds.length} ${e.allocationType === "group" ? "lote(s)" : "animal(is)"}`
                    : ""}
                  {e.cancelReason ? ` · ${e.cancelReason}` : ""}
                </div>
                {write && e.status === "open" ? (
                  acting?.id === e.id ? (
                    <form onSubmit={act} style={{ marginTop: 8 }}>
                      <div className="field">
                        <label htmlFor={`act-${e.id}`}>
                          {acting.mode === "pay" ? "Data do pagamento" : "Motivo do cancelamento"}
                        </label>
                        <input
                          id={`act-${e.id}`}
                          type={acting.mode === "pay" ? "date" : "text"}
                          max={acting.mode === "pay" ? today : undefined}
                          required
                          value={actValue}
                          onChange={(ev) => setActValue(ev.target.value)}
                        />
                      </div>
                      <div className="actions" style={{ marginTop: 0 }}>
                        <button className="btn btn-primary">
                          {acting.mode === "pay" ? "Confirmar pagamento" : "Cancelar lançamento"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => setActing(null)}
                        >
                          Voltar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="actions" style={{ marginTop: 8 }}>
                      <button
                        className="btn btn-soft"
                        onClick={() => {
                          setActing({ id: e.id, mode: "pay" });
                          setActValue(today);
                        }}
                      >
                        {e.kind === "income" ? "Recebido" : "Pago"}
                      </button>
                      {e.sourceType === "manual" ? (
                        <button
                          className="btn btn-ghost"
                          onClick={() => {
                            setActing({ id: e.id, mode: "cancel" });
                            setActValue("");
                          }}
                        >
                          Cancelar
                        </button>
                      ) : null}
                    </div>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function EntryForm({ onDone }: { onDone: () => void }) {
  const { farm } = useSession();
  const { places, animals } = useLocalHerd(farm!.id);
  const today = todayInTimezone(farm!.timezone);
  const [f, setF] = useState({
    kind: "expense" as "income" | "expense",
    category: "feed" as EntryCategory,
    description: "",
    amount: "",
    dueOn: today,
    paid: false,
    counterparty: "",
    document: "",
    allocationType: "farm" as "farm" | "group" | "animals",
    groupIds: [] as string[],
  });
  const [key] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cats = f.kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const groups = (places ?? []).filter((p) => p.kind === "group");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amount = num(f.amount);
    if (!amount) return;
    setBusy(true);
    setError(null);
    const body: FinancialEntryInput = {
      kind: f.kind,
      category: f.category,
      description: f.description.trim(),
      amount,
      dueOn: f.dueOn,
      ...(f.paid ? { paidOn: f.dueOn <= today ? f.dueOn : today } : {}),
      ...(f.counterparty.trim() ? { counterparty: f.counterparty.trim() } : {}),
      ...(f.document.trim() ? { document: f.document.trim() } : {}),
      allocationType: f.allocationType,
      allocationIds: f.allocationType === "group" ? f.groupIds : [],
    };
    try {
      await post(`/v1/farms/${farm!.id}/finance/entries`, body, { idempotencyKey: key });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>Novo lançamento</h2>
      {error ? <Alert kind="danger">{error}</Alert> : null}
      <div className="seg" role="radiogroup" aria-label="Tipo" style={{ marginBottom: 12 }}>
        {(["expense", "income"] as const).map((k) => (
          <label key={k}>
            <input
              type="radio"
              name="ek"
              checked={f.kind === k}
              onChange={() =>
                setF({ ...f, kind: k, category: k === "income" ? "other_income" : "feed" })
              }
            />{" "}
            {k === "income" ? "Receita" : "Despesa"}
          </label>
        ))}
      </div>
      <div className="grid two" style={{ gap: 12 }}>
        <Field id="e-cat" label="Categoria">
          <select
            id="e-cat"
            value={f.category}
            onChange={(e) => setF({ ...f, category: e.target.value as EntryCategory })}
          >
            {cats.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_FIN_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="e-amount" label="Valor (R$)">
          <input
            id="e-amount"
            required
            inputMode="decimal"
            value={f.amount}
            onChange={(e) => setF({ ...f, amount: e.target.value })}
          />
        </Field>
      </div>
      <Field id="e-desc" label="Descrição">
        <input
          id="e-desc"
          required
          minLength={2}
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
        />
      </Field>
      <div className="grid two" style={{ gap: 12 }}>
        <Field id="e-due" label="Vencimento">
          <input
            id="e-due"
            type="date"
            value={f.dueOn}
            onChange={(e) => setF({ ...f, dueOn: e.target.value })}
          />
        </Field>
        <Field id="e-cp" label={f.kind === "income" ? "Cliente" : "Fornecedor"} hint="opcional">
          <input
            id="e-cp"
            value={f.counterparty}
            onChange={(e) => setF({ ...f, counterparty: e.target.value })}
          />
        </Field>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={f.paid}
          onChange={(e) => setF({ ...f, paid: e.target.checked })}
        />
        <span>Já {f.kind === "income" ? "recebido" : "pago"}</span>
      </label>
      <Field id="e-alloc" label="Rateio do custo">
        <select
          id="e-alloc"
          value={f.allocationType}
          onChange={(e) => setF({ ...f, allocationType: e.target.value as "farm" | "group" })}
        >
          <option value="farm">Fazenda toda</option>
          <option value="group">Lotes específicos</option>
        </select>
      </Field>
      {f.allocationType === "group" ? (
        <div className="seg" style={{ marginBottom: 12 }}>
          {groups.map((g) => (
            <label key={g.id}>
              <input
                type="checkbox"
                checked={f.groupIds.includes(g.id)}
                onChange={(e) =>
                  setF({
                    ...f,
                    groupIds: e.target.checked
                      ? [...f.groupIds, g.id]
                      : f.groupIds.filter((x) => x !== g.id),
                  })
                }
              />{" "}
              {g.name} (
              {(animals ?? []).filter((a) => a.status === "active" && a.groupId === g.id).length})
            </label>
          ))}
        </div>
      ) : null}
      <div className="actions">
        <button
          className="btn btn-primary"
          disabled={busy || !num(f.amount) || (f.allocationType === "group" && !f.groupIds.length)}
        >
          {busy ? "Salvando…" : "Salvar lançamento"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
