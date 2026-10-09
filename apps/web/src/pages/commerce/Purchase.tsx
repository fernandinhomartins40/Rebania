import type { PurchaseInput } from "@rebania/contracts";
import {
  CATEGORY_LABEL,
  CATEGORIES,
  computePrice,
  formatBRL,
  PRICE_MODE_LABEL,
  PRICE_MODES,
  todayInTimezone,
  toCents,
  type Category,
  type PriceMode,
} from "@rebania/domain";
import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { errorMessage, NetworkError, post } from "../../api/client.ts";
import { Alert, Field, Loading, PageHead } from "../../components/ui.tsx";
import { useDraft } from "../../state/draft.ts";
import { useLocalHerd } from "../../state/local-data.ts";
import { useSession } from "../../state/session.tsx";
import { useSync } from "../../state/sync.tsx";
import { num } from "./Sale.tsx";

interface Row {
  tag: string;
  category: Category;
  weight: string;
  breed: string;
}
interface Draft {
  date: string;
  rows: Row[];
  groupId: string;
  mode: PriceMode;
  price: string;
  yieldPct: string;
  totalKg: string;
  counterparty: string;
  document: string;
  dueOn: string;
  paid: boolean;
  key: string;
}

const SEX_OF: Record<Category, "male" | "female"> = {
  calf_female: "female",
  heifer: "female",
  cow: "female",
  calf_male: "male",
  steer: "male",
  bull: "male",
  ox: "male",
};
const emptyRow = (): Row => ({ tag: "", category: "steer", weight: "", breed: "" });

/** T35 Compra: cadastra os animais comprados, peso de entrada e conta a pagar numa transação. */
export function PurchasePage() {
  const { farm } = useSession();
  const { engine } = useSync();
  const { places } = useLocalHerd(farm!.id);
  const today = todayInTimezone(farm!.timezone);
  const [d, setD, clear] = useDraft<Draft>(`purchase:${farm!.id}`, {
    date: today,
    rows: [emptyRow()],
    groupId: "",
    mode: "per_kg_live",
    price: "",
    yieldPct: "",
    totalKg: "",
    counterparty: "",
    document: "",
    dueOn: today,
    paid: false,
    key: crypto.randomUUID(),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; animalIds: string[]; totalCents: number } | null>(
    null,
  );
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const setRow = (i: number, patch: Partial<Row>) =>
    set(
      "rows",
      d.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    );
  if (!places) return <Loading />;

  const individual = d.rows.every((r) => num(r.weight));
  const totalKg = individual
    ? Math.round(d.rows.reduce((s, r) => s + (num(r.weight) ?? 0), 0) * 100) / 100
    : num(d.totalKg);
  let preview: { totalCents: number; formula: string } | null = null;
  try {
    if (num(d.price))
      preview = computePrice({
        mode: d.mode,
        unitCents: toCents(num(d.price)!),
        heads: d.rows.length,
        totalLiveKg: totalKg,
        carcassYieldPercent: num(d.yieldPct),
      });
  } catch {
    preview = null;
  }

  if (done) {
    return (
      <section>
        <PageHead title="Compra" back="/comercial" />
        <Alert kind="success">
          Compra registrada: {done.animalIds.length} animal(is) cadastrados,{" "}
          {formatBRL(done.totalCents)} em contas a pagar.
        </Alert>
        <div className="actions">
          <Link className="btn btn-primary" to={`/comercial/${done.id}`}>
            Ver compra
          </Link>
          <Link className="btn btn-secondary" to="/rebanho">
            Rebanho
          </Link>
        </div>
      </section>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!preview) return;
    setBusy(true);
    setError(null);
    const payload: PurchaseInput = {
      id: d.key,
      date: d.date,
      animals: d.rows.map((r) => ({
        sex: SEX_OF[r.category],
        category: r.category,
        ...(r.breed.trim() ? { breed: r.breed.trim() } : {}),
        ...(num(r.weight) ? { liveWeightKg: num(r.weight)! } : {}),
        identifiers: [{ type: "visual_tag", value: r.tag.trim() }],
      })),
      ...(d.groupId ? { groupId: d.groupId } : {}),
      ...(!individual && num(d.totalKg) ? { totalLiveKg: num(d.totalKg)! } : {}),
      priceMode: d.mode,
      unitPrice: num(d.price)!,
      ...(num(d.yieldPct) ? { carcassYieldPercent: num(d.yieldPct)! } : {}),
      counterparty: d.counterparty.trim(),
      ...(d.document.trim() ? { document: d.document.trim() } : {}),
      dueOn: d.dueOn,
      paid: d.paid,
    };
    try {
      const r = await post<{ id: string; animalIds: string[]; totalCents: number }>(
        `/v1/farms/${farm!.id}/purchases`,
        payload,
        { idempotencyKey: d.key },
      );
      clear();
      void engine.syncNow();
      setDone(r);
    } catch (err) {
      setError(
        err instanceof NetworkError
          ? "Sem conexão. A compra cadastra animais e precisa do servidor; o rascunho fica guardado."
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  const groups = places.filter((p) => p.kind === "group");
  return (
    <section>
      <PageHead title="Compra de animais" back="/comercial" />
      <form className="card" onSubmit={submit}>
        {error ? <Alert kind="danger">{error}</Alert> : null}
        <div className="grid two" style={{ gap: 12 }}>
          <Field id="p-date" label="Data da compra">
            <input
              id="p-date"
              type="date"
              max={today}
              value={d.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </Field>
          <Field id="p-cp" label="Vendedor">
            <input
              id="p-cp"
              required
              minLength={2}
              value={d.counterparty}
              onChange={(e) => set("counterparty", e.target.value)}
            />
          </Field>
        </div>
        <h2 style={{ fontSize: 18, margin: "8px 0" }}>Animais ({d.rows.length})</h2>
        {d.rows.map((r, i) => (
          <fieldset key={i} className="dose-row">
            <legend className="visually-hidden">Animal {i + 1}</legend>
            <div className="grid two" style={{ gap: 12 }}>
              <Field id={`pr-tag-${i}`} label="Brinco">
                <input
                  id={`pr-tag-${i}`}
                  required
                  value={r.tag}
                  onChange={(e) => setRow(i, { tag: e.target.value })}
                />
              </Field>
              <Field id={`pr-cat-${i}`} label="Categoria">
                <select
                  id={`pr-cat-${i}`}
                  value={r.category}
                  onChange={(e) => setRow(i, { category: e.target.value as Category })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id={`pr-w-${i}`} label="Peso vivo (kg)" hint="opcional">
                <input
                  id={`pr-w-${i}`}
                  inputMode="decimal"
                  value={r.weight}
                  onChange={(e) => setRow(i, { weight: e.target.value })}
                />
              </Field>
              <Field id={`pr-b-${i}`} label="Raça" hint="opcional">
                <input
                  id={`pr-b-${i}`}
                  value={r.breed}
                  onChange={(e) => setRow(i, { breed: e.target.value })}
                />
              </Field>
            </div>
            {d.rows.length > 1 ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  set(
                    "rows",
                    d.rows.filter((_, j) => j !== i),
                  )
                }
              >
                <Trash2 size={18} aria-hidden="true" /> Remover
              </button>
            ) : null}
          </fieldset>
        ))}
        <button
          type="button"
          className="btn btn-soft"
          onClick={() =>
            set("rows", [...d.rows, { ...emptyRow(), category: d.rows.at(-1)!.category }])
          }
        >
          <Plus size={18} aria-hidden="true" /> Adicionar animal
        </button>
        <Field id="p-group" label="Lote de destino" hint="opcional">
          <select id="p-group" value={d.groupId} onChange={(e) => set("groupId", e.target.value)}>
            <option value="">Sem lote</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        {!individual ? (
          <Field id="p-total" label="Peso vivo total (kg)" hint="se não pesou um a um">
            <input
              id="p-total"
              inputMode="decimal"
              value={d.totalKg}
              onChange={(e) => set("totalKg", e.target.value)}
            />
          </Field>
        ) : null}
        <div className="grid two" style={{ gap: 12 }}>
          <Field id="p-mode" label="Forma de preço">
            <select
              id="p-mode"
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
          <Field id="p-price" label={d.mode === "total" ? "Valor total (R$)" : "Preço (R$)"}>
            <input
              id="p-price"
              required
              inputMode="decimal"
              value={d.price}
              onChange={(e) => set("price", e.target.value)}
            />
          </Field>
        </div>
        {d.mode === "per_arroba" ? (
          <Field id="p-yield" label="Rendimento de carcaça (%)" hint="obrigatório">
            <input
              id="p-yield"
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
        ) : null}
        <div className="grid two" style={{ gap: 12 }}>
          <Field id="p-doc" label="Documento (GTA/NF)" hint="opcional">
            <input
              id="p-doc"
              value={d.document}
              onChange={(e) => set("document", e.target.value)}
            />
          </Field>
          <Field id="p-due" label="Vencimento do pagamento">
            <input
              id="p-due"
              type="date"
              value={d.dueOn}
              onChange={(e) => set("dueOn", e.target.value)}
            />
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={d.paid} onChange={(e) => set("paid", e.target.checked)} />
          <span>Já pago na data da compra</span>
        </label>
        <div className="actions">
          <button className="btn btn-primary btn-lg" disabled={busy || !preview}>
            {busy ? "Registrando…" : `Confirmar compra de ${d.rows.length}`}
          </button>
        </div>
      </form>
    </section>
  );
}
