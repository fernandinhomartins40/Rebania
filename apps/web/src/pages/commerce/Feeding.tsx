import type { FeedingDto, FeedingInput } from "@rebania/contracts";
import {
  daysBetween,
  formatBRL,
  formatQuantity,
  isCivilDate,
  todayInTimezone,
} from "@rebania/domain";
import { CalendarDays } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Alert, Field, formatDate, Loading, PageHead } from "../../components/ui.tsx";
import { newMutationBase, type SubmitResult } from "../../offline/engine.ts";
import { useCachedGet } from "../../state/cached.ts";
import { useDraft } from "../../state/draft.ts";
import { useProducts } from "../../state/health.ts";
import { useLocalHerd } from "../../state/local-data.ts";
import { useSession } from "../../state/session.tsx";
import { useSync } from "../../state/sync.tsx";
import { num } from "./Sale.tsx";

/** T33 Trato por lote: dieta e quantidade; baixa o estoque e estima o custo. */
export function FeedingPage() {
  const { farm } = useSession();
  const { engine } = useSync();
  const { animals, places } = useLocalHerd(farm!.id);
  const { products } = useProducts(farm!.id);
  const { data, reload } = useCachedGet<{ items: FeedingDto[] }>(
    `/v1/farms/${farm!.id}/feedings`,
    `feedings:${farm!.id}`,
  );
  const today = todayInTimezone(farm!.timezone);
  const [d, setD, clear] = useDraft(`feeding:${farm!.id}`, {
    date: today,
    groupId: "",
    diet: "",
    productId: "",
    quantity: "",
    unit: "kg",
    notes: "",
  });
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [busy, setBusy] = useState(false);
  if (!animals || !products) return <Loading />;
  const feeds = products.filter(
    (p) => !p.archived && (p.kind === "feed" || p.kind === "supplement"),
  );
  const groups = places.filter((p) => p.kind === "group");
  const heads = d.groupId
    ? animals.filter((a) => a.status === "active" && a.groupId === d.groupId).length
    : 0;
  const product = feeds.find((p) => p.id === d.productId);
  const qty = num(d.quantity);
  const dateError = !isCivilDate(d.date)
    ? "Data inválida."
    : daysBetween(today, d.date) > 0
      ? "Data no futuro."
      : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!qty || dateError) return;
    setBusy(true);
    const id = crypto.randomUUID();
    const payload: FeedingInput = {
      date: d.date,
      diet: d.diet.trim() || product?.name || "Trato",
      quantity: qty,
      ...(d.groupId ? { groupId: d.groupId } : {}),
      ...(d.productId ? { productId: d.productId } : { unit: d.unit }),
      ...(d.notes.trim() ? { notes: d.notes.trim() } : {}),
    };
    const r = await engine.submit({ ...newMutationBase(id), type: "feeding.record", payload });
    setBusy(false);
    setResult(r);
    if (r.status !== "rejected") {
      clear();
      reload();
    }
  }

  return (
    <section>
      <PageHead title="Trato" back="/registrar" />
      {result ? (
        result.status === "synced" ? (
          <Alert kind="success">Trato registrado e sincronizado.</Alert>
        ) : result.status === "saved_locally" ? (
          <Alert kind="warning">Salvo no aparelho. Enviaremos quando houver conexão.</Alert>
        ) : (
          <Alert kind="danger">Não registrado: {result.message}</Alert>
        )
      ) : null}
      <form className="card" onSubmit={submit}>
        <div className="grid two" style={{ gap: 12 }}>
          <Field id="f-group" label="Lote">
            <select
              id="f-group"
              value={d.groupId}
              onChange={(e) => setD((p) => ({ ...p, groupId: e.target.value }))}
            >
              <option value="">Sem lote específico</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="f-date"
            label="Data"
            error={dateError}
            icon={<CalendarDays size={22} aria-hidden="true" />}
          >
            <input
              id="f-date"
              type="date"
              max={today}
              value={d.date}
              onChange={(e) => setD((p) => ({ ...p, date: e.target.value }))}
            />
          </Field>
        </div>
        {d.groupId ? <p className="hint">{heads} animal(is) ativos no lote hoje.</p> : null}
        <Field id="f-prod" label="Produto do estoque" hint="opcional; baixa o saldo">
          <select
            id="f-prod"
            value={d.productId}
            onChange={(e) => setD((p) => ({ ...p, productId: e.target.value }))}
          >
            <option value="">Sem baixa de estoque</option>
            {feeds.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · saldo {formatQuantity(p.balance, p.unit)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="f-diet" label="Dieta / descrição" hint={product ? "opcional" : undefined}>
          <input
            id="f-diet"
            required={!product}
            placeholder="Ex.: silagem + concentrado"
            value={d.diet}
            onChange={(e) => setD((p) => ({ ...p, diet: e.target.value }))}
          />
        </Field>
        <div className="grid two" style={{ gap: 12 }}>
          <Field id="f-qty" label={`Quantidade (${product?.unit ?? d.unit})`}>
            <input
              id="f-qty"
              required
              inputMode="decimal"
              value={d.quantity}
              onChange={(e) => setD((p) => ({ ...p, quantity: e.target.value }))}
            />
          </Field>
          {!product ? (
            <Field id="f-unit" label="Unidade">
              <select
                id="f-unit"
                value={d.unit}
                onChange={(e) => setD((p) => ({ ...p, unit: e.target.value }))}
              >
                {["kg", "t", "L", "sc"].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
        {product && qty && qty > product.balance ? (
          <Alert kind="warning">
            Saldo insuficiente: o trato é registrado e o estoque vai para conferência.
          </Alert>
        ) : null}
        <div className="actions">
          <button className="btn btn-primary btn-lg" disabled={busy || !qty || Boolean(dateError)}>
            {busy ? "Registrando…" : "Registrar trato"}
          </button>
        </div>
      </form>
      <h2 style={{ fontSize: 20, marginTop: 24 }}>Últimos tratos</h2>
      {!data ? null : data.items.length === 0 ? (
        <p className="hint">Nenhum trato registrado.</p>
      ) : (
        <ul className="list">
          {data.items.slice(0, 30).map((f) => (
            <li key={f.id} className="list-item" style={{ opacity: f.voided ? 0.5 : 1 }}>
              <span>
                <span className="title">
                  {f.groupName ?? "Sem lote"} · {f.productName ?? f.diet}
                </span>
                <div className="meta">
                  {formatDate(f.date)} · {formatQuantity(f.quantity, f.unit)} · {f.heads} cab.
                  {f.costCents !== null
                    ? ` · custo estimado ${formatBRL(f.costCents)}`
                    : " · sem custo nas entradas"}
                </div>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
