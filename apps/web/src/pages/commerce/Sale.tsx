import type { SaleCheckDto, SaleInput } from "@rebania/contracts";
import {
  computePrice,
  daysBetween,
  formatBRL,
  isCivilDate,
  PRICE_MODE_LABEL,
  PRICE_MODES,
  todayInTimezone,
  toCents,
  type PriceMode,
} from "@rebania/domain";
import { ArrowRight, CalendarDays, ShieldAlert } from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "react-router";
import { errorMessage, NetworkError, post } from "../../api/client.ts";
import { GroupPicker, SelectionSummary } from "../../components/GroupPicker.tsx";
import { Alert, Field, formatDate, Loading, PageHead, Steps } from "../../components/ui.tsx";
import type { LocalAnimal } from "../../offline/engine.ts";
import { useDraft } from "../../state/draft.ts";
import { useLocalHerd } from "../../state/local-data.ts";
import { useSession } from "../../state/session.tsx";
import { useSync } from "../../state/sync.tsx";

interface Draft {
  step: 1 | 2 | 3;
  ids: string[];
  date: string;
  weights: Record<string, string>;
  totalKg: string;
  mode: PriceMode;
  price: string;
  yieldPct: string;
  counterparty: string;
  document: string;
  dueOn: string;
  paid: boolean;
  notes: string;
  key: string;
}

export const num = (v: string) => {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** T35 Venda: selecionar animais → peso e preço → revisar carências e confirmar baixa/receita. */
export function SalePage() {
  const { farm } = useSession();
  const { engine } = useSync();
  const { animals, places } = useLocalHerd(farm!.id);
  const today = todayInTimezone(farm!.timezone);
  const [d, setD, clear] = useDraft<Draft>(`sale:${farm!.id}`, {
    step: 1,
    ids: [],
    date: today,
    weights: {},
    totalKg: "",
    mode: "per_kg_live",
    price: "",
    yieldPct: "",
    counterparty: "",
    document: "",
    dueOn: today,
    paid: false,
    notes: "",
    key: crypto.randomUUID(),
  });
  const [check, setCheck] = useState<SaleCheckDto | null>(null);
  const [override, setOverride] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; totalCents: number; formula: string } | null>(
    null,
  );
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const eligible = useCallback((a: LocalAnimal) => a.status === "active", []);

  if (!animals) return <Loading />;
  const byId = new Map(animals.map((a) => [a.id, a]));
  const dateError = !isCivilDate(d.date)
    ? "Data inválida."
    : daysBetween(today, d.date) > 0
      ? "Data no futuro."
      : null;
  const individual = d.ids.every((id) => num(d.weights[id] ?? ""));
  const totalKg = individual
    ? Math.round(d.ids.reduce((s, id) => s + (num(d.weights[id] ?? "") ?? 0), 0) * 100) / 100
    : num(d.totalKg);
  let preview: { totalCents: number; formula: string } | null = null;
  let previewError: string | null = null;
  try {
    const p = num(d.price);
    if (p)
      preview = computePrice({
        mode: d.mode,
        unitCents: toCents(p),
        heads: d.ids.length,
        totalLiveKg: totalKg,
        carcassYieldPercent: num(d.yieldPct),
      });
  } catch (e) {
    previewError = (e as Error).message;
  }

  if (done) {
    return (
      <section>
        <PageHead title="Venda" back="/comercial" />
        <Alert kind="success">
          Venda registrada: {formatBRL(done.totalCents)} ({done.formula}). Animais baixados e conta
          a receber criada.
        </Alert>
        <div className="actions">
          <Link className="btn btn-primary" to={`/comercial/${done.id}`}>
            Ver venda
          </Link>
          <Link className="btn btn-secondary" to="/fazenda/financeiro">
            Financeiro
          </Link>
        </div>
      </section>
    );
  }

  async function review() {
    setError(null);
    try {
      setCheck(
        await post<SaleCheckDto>(`/v1/farms/${farm!.id}/sales/check`, {
          date: d.date,
          animalIds: d.ids,
        }),
      );
      set("step", 3);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const payload: SaleInput = {
      id: d.key,
      date: d.date,
      items: d.ids.map((id) => ({
        animalId: id,
        ...(individual ? { liveWeightKg: num(d.weights[id]!)! } : {}),
      })),
      ...(!individual && num(d.totalKg) ? { totalLiveKg: num(d.totalKg)! } : {}),
      priceMode: d.mode,
      unitPrice: num(d.price)!,
      ...(num(d.yieldPct) ? { carcassYieldPercent: num(d.yieldPct)! } : {}),
      counterparty: d.counterparty.trim(),
      ...(d.document.trim() ? { document: d.document.trim() } : {}),
      ...(d.notes.trim() ? { notes: d.notes.trim() } : {}),
      dueOn: d.dueOn,
      paid: d.paid,
      ...(override.trim() ? { withdrawalOverride: { reason: override.trim() } } : {}),
    };
    try {
      const r = await post<{ id: string; totalCents: number; formula: string }>(
        `/v1/farms/${farm!.id}/sales`,
        payload,
        { idempotencyKey: d.key },
      );
      clear();
      void engine.syncNow();
      setDone(r);
    } catch (e) {
      setError(
        e instanceof NetworkError
          ? "Sem conexão. A venda exige confirmação do servidor (carência e baixa); o rascunho fica guardado."
          : errorMessage(e),
      );
    } finally {
      setBusy(false);
    }
  }

  const blocking = check?.issues.filter((i) => i.blocking) ?? [];
  const onlyWithdrawal = blocking.length > 0 && blocking.every((i) => i.code === "in_withdrawal");
  const canConfirm =
    check &&
    (blocking.length === 0 ||
      (onlyWithdrawal && check.canOverrideWithdrawal && override.trim().length >= 10));

  return (
    <section>
      <PageHead title="Venda" back="/comercial" />
      <Steps current={d.step} />
      {error ? <Alert kind="danger">{error}</Alert> : null}
      {d.step === 1 ? (
        <div className="card">
          <GroupPicker
            animals={animals}
            places={places}
            eligible={eligible}
            selected={d.ids}
            onChange={(ids) => set("ids", ids)}
            hint="Marque os animais que saem nesta venda."
          />
          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              disabled={!d.ids.length}
              onClick={() => set("step", 2)}
            >
              Continuar com {d.ids.length} <ArrowRight size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
      {d.step === 2 ? (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            if (!dateError && preview && d.counterparty.trim().length >= 2) void review();
          }}
        >
          <div className="grid two" style={{ gap: 12 }}>
            <Field
              id="s-date"
              label="Data da venda"
              error={dateError}
              icon={<CalendarDays size={22} aria-hidden="true" />}
            >
              <input
                id="s-date"
                type="date"
                max={today}
                value={d.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </Field>
            <Field id="s-cp" label="Comprador">
              <input
                id="s-cp"
                required
                minLength={2}
                value={d.counterparty}
                onChange={(e) => set("counterparty", e.target.value)}
              />
            </Field>
          </div>
          <h2 style={{ fontSize: 18, margin: "8px 0" }}>Peso vivo (kg)</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            Informe por animal ou só o total da balança do lote.
          </p>
          <ul className="list" style={{ maxHeight: 280, overflow: "auto" }}>
            {d.ids.map((id) => (
              <li key={id} className="list-item">
                <span className="title">{byId.get(id)?.primaryIdentifier ?? "Animal"}</span>
                <input
                  aria-label={`Peso de ${byId.get(id)?.primaryIdentifier ?? "animal"}`}
                  inputMode="decimal"
                  style={{ maxWidth: 140 }}
                  value={d.weights[id] ?? ""}
                  onChange={(e) => set("weights", { ...d.weights, [id]: e.target.value })}
                />
              </li>
            ))}
          </ul>
          {!individual ? (
            <Field id="s-total" label="Peso vivo total do lote (kg)" hint="se não pesou um a um">
              <input
                id="s-total"
                inputMode="decimal"
                value={d.totalKg}
                onChange={(e) => set("totalKg", e.target.value)}
              />
            </Field>
          ) : null}
          <div className="grid two" style={{ gap: 12 }}>
            <Field id="s-mode" label="Forma de preço">
              <select
                id="s-mode"
                value={d.mode}
                onChange={(e) => set("mode", e.target.value as PriceMode)}
              >
                {PRICE_MODES.map((m) => (
                  <option key={m} value={m}>
                    {PRICE_MODE_LABEL[m]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="s-price" label={d.mode === "total" ? "Valor total (R$)" : "Preço (R$)"}>
              <input
                id="s-price"
                required
                inputMode="decimal"
                value={d.price}
                onChange={(e) => set("price", e.target.value)}
              />
            </Field>
          </div>
          {d.mode === "per_arroba" ? (
            <Field
              id="s-yield"
              label="Rendimento de carcaça (%)"
              hint="obrigatório; peso vivo não é arroba"
            >
              <input
                id="s-yield"
                inputMode="decimal"
                value={d.yieldPct}
                onChange={(e) => set("yieldPct", e.target.value)}
              />
            </Field>
          ) : null}
          {preview ? (
            <Alert kind="info">
              Total: <strong>{formatBRL(preview.totalCents)}</strong> · {preview.formula}
            </Alert>
          ) : previewError && d.price ? (
            <Alert kind="warning">{previewError}</Alert>
          ) : null}
          <div className="grid two" style={{ gap: 12 }}>
            <Field id="s-doc" label="Documento (GTA/NF)" hint="opcional">
              <input
                id="s-doc"
                value={d.document}
                onChange={(e) => set("document", e.target.value)}
              />
            </Field>
            <Field id="s-due" label="Vencimento do recebimento">
              <input
                id="s-due"
                type="date"
                value={d.dueOn}
                onChange={(e) => set("dueOn", e.target.value)}
              />
            </Field>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={d.paid}
              onChange={(e) => set("paid", e.target.checked)}
            />
            <span>Já recebido na data da venda</span>
          </label>
          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              disabled={Boolean(dateError) || !preview || d.counterparty.trim().length < 2}
            >
              Revisar carências <ArrowRight size={20} aria-hidden="true" />
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => set("step", 1)}>
              Voltar
            </button>
          </div>
        </form>
      ) : null}
      {d.step === 3 && check ? (
        <div className="card review">
          <h2>Revise antes de confirmar</h2>
          <dl>
            <dt>Data</dt>
            <dd>{formatDate(d.date)}</dd>
            <dt>Comprador</dt>
            <dd>{d.counterparty}</dd>
            <dt>Total</dt>
            <dd>{preview ? `${formatBRL(preview.totalCents)} · ${preview.formula}` : "—"}</dd>
          </dl>
          <SelectionSummary animals={animals} ids={d.ids} />
          {blocking.length ? (
            <Alert kind="danger">
              <strong>Pendências que impedem a venda:</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {blocking.map((i) => (
                  <li key={`${i.animalId}:${i.code}`}>{i.message}</li>
                ))}
              </ul>
            </Alert>
          ) : (
            <Alert kind="success">Nenhuma carência ou pendência nos animais selecionados.</Alert>
          )}
          {onlyWithdrawal ? (
            check.canOverrideWithdrawal ? (
              <div className="field">
                <label htmlFor="s-ovr">
                  <ShieldAlert size={18} aria-hidden="true" /> Exceção de carência (proprietário)
                </label>
                <textarea
                  id="s-ovr"
                  rows={3}
                  placeholder="Motivo (mín. 10 caracteres). Fica registrado com seu nome."
                  value={override}
                  onChange={(e) => setOverride(e.target.value)}
                />
              </div>
            ) : (
              <p className="hint">
                Somente o proprietário pode registrar exceção de carência. Retire os animais da
                venda ou aguarde o fim do prazo.
              </p>
            )
          ) : null}
          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              disabled={busy || !canConfirm}
              onClick={confirm}
            >
              {busy ? "Registrando…" : `Confirmar venda de ${d.ids.length}`}
            </button>
            <button className="btn btn-ghost" onClick={() => set("step", 2)}>
              Editar
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
