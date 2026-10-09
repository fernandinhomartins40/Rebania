import type { ProductDto, ProductInput, StockMovementDto } from "@rebania/contracts";
import {
  formatQuantity,
  PRODUCT_KIND_LABEL,
  PRODUCT_KINDS,
  STOCK_MOVEMENT_LABEL,
  todayInTimezone,
  UNIT_LABEL,
  UNITS,
  type ProductKind,
  type StockMovementKind,
  type Unit,
} from "@rebania/domain";
import { ChevronRight, ClipboardCheck, PackagePlus, Plus, TriangleAlert } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { errorMessage, get, patch, post } from "../../api/client.ts";
import { withdrawalText } from "../../components/ProductDoses.tsx";
import { Alert, Empty, Field, formatDate, Loading, PageHead } from "../../components/ui.tsx";
import { useProducts } from "../../state/health.ts";
import { useSession } from "../../state/session.tsx";

const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return v.trim() && Number.isFinite(n) ? n : null;
};
const int = (v: string) => (v.trim() && /^\d+$/.test(v.trim()) ? Number(v) : null);

/** T37 Estoque: insumos, lotes/validade, saldo, mínimos, movimentos e conferência. */
export function StockPage() {
  const { farm, can } = useSession();
  const { products, offline, reload } = useProducts(farm!.id);
  const [params, setParams] = useSearchParams();
  const manage = can("stock.manage") || can("health.manage");
  const selected = params.get("produto");
  const view = params.get("ver");
  const go = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  if (!products) return <Loading />;
  if (params.get("novo") === "1") {
    return (
      <ProductForm
        onDone={(id) => {
          reload();
          go({ novo: null, produto: id ?? null });
        }}
      />
    );
  }
  if (selected) {
    const p = products.find((x) => x.id === selected);
    if (!p) return <Empty title="Produto não encontrado" />;
    return <ProductDetail product={p} onChange={reload} onBack={() => go({ produto: null })} />;
  }
  if (view === "conferencia")
    return <ReviewList onBack={() => go({ ver: null })} onDone={reload} />;

  const low = products.filter((p) => p.belowMin);
  const review = products.reduce((n, p) => n + p.pendingReview, 0);
  return (
    <section>
      <PageHead
        title="Estoque"
        back="/fazenda"
        aside={
          manage ? (
            <button className="btn btn-soft" onClick={() => go({ novo: "1" })}>
              <Plus size={20} aria-hidden="true" /> Produto
            </button>
          ) : null
        }
      />
      {offline ? <Alert kind="info">Sem conexão: saldos da última consulta.</Alert> : null}
      {review ? (
        <Alert kind="warning">
          {review} consumo(s) de campo deixaram saldo negativo.{" "}
          {can("stock.manage") ? (
            <button className="link-btn" onClick={() => go({ ver: "conferencia" })}>
              Conferir agora
            </button>
          ) : (
            "O administrativo precisa conferir."
          )}
        </Alert>
      ) : null}
      {low.length ? (
        <Alert kind="info">Abaixo do mínimo: {low.map((p) => p.name).join(", ")}.</Alert>
      ) : null}
      {products.length === 0 ? (
        <Empty title="Nenhum produto cadastrado">
          <p className="hint">
            Cadastre vacinas, medicamentos, sêmen e insumos. A carência é configurada por você, com
            a fonte técnica (bula ou responsável).
          </p>
          {manage ? (
            <button className="btn btn-primary" onClick={() => go({ novo: "1" })}>
              <PackagePlus size={20} aria-hidden="true" /> Cadastrar produto
            </button>
          ) : null}
        </Empty>
      ) : (
        <div className="animal-list">
          {products.map((p) => (
            <button
              key={p.id}
              className="animal-card"
              style={{ textAlign: "left", width: "100%" }}
              onClick={() => go({ produto: p.id })}
            >
              <div className="body">
                <span className="name">
                  {p.name}
                  {p.belowMin ? <span className="badge badge-warn">Abaixo do mínimo</span> : null}
                  {p.pendingReview ? <span className="badge badge-danger">Conferir</span> : null}
                </span>
                <span className="meta">
                  {PRODUCT_KIND_LABEL[p.kind]}
                  {p.kind === "semen" && p.sireName ? ` · ${p.sireName}` : ""} · {p.batches.length}{" "}
                  lote(s)
                </span>
                <span className="meta">
                  Saldo{" "}
                  <strong style={{ color: p.balance < 0 ? "var(--color-danger)" : undefined }}>
                    {formatQuantity(p.balance, p.unit)}
                  </strong>
                  {p.minStock !== null ? ` · mínimo ${formatQuantity(p.minStock, p.unit)}` : ""}
                </span>
              </div>
              <span className="chev">
                <ChevronRight size={22} aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ProductForm({ product, onDone }: { product?: ProductDto; onDone: (id?: string) => void }) {
  const { farm } = useSession();
  const [f, setF] = useState({
    name: product?.name ?? "",
    kind: (product?.kind ?? "vaccine") as ProductKind,
    unit: (product?.unit ?? "mL") as Unit,
    minStock: product?.minStock?.toString() ?? "",
    meat: product?.withdrawalMeatDays?.toString() ?? "",
    milk: product?.withdrawalMilkDays?.toString() ?? "",
    source: product?.withdrawalSource ?? "",
    sireName: product?.sireName ?? "",
    notes: product?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const hasWithdrawal = Boolean(f.meat.trim() || f.milk.trim());
  const sourceError = hasWithdrawal && !f.source.trim() ? "Informe a fonte da carência." : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sourceError) return;
    setBusy(true);
    setError(null);
    const body: ProductInput = {
      name: f.name.trim(),
      kind: f.kind,
      unit: f.unit,
      minStock: num(f.minStock),
      withdrawalMeatDays: int(f.meat),
      withdrawalMilkDays: int(f.milk),
      withdrawalSource: f.source.trim() || null,
      sireName: f.kind === "semen" ? f.sireName.trim() || null : null,
      notes: f.notes.trim() || null,
    };
    try {
      const r = product
        ? await patch<ProductDto>(`/v1/farms/${farm!.id}/products/${product.id}`, body)
        : await post<ProductDto>(`/v1/farms/${farm!.id}/products`, body);
      onDone(r.id);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHead
        title={product ? "Editar produto" : "Novo produto"}
        onBack={() => onDone(product?.id)}
      />
      <form className="card" onSubmit={submit}>
        {error ? <Alert kind="danger">{error}</Alert> : null}
        <Field id="p-name" label="Nome">
          <input
            id="p-name"
            required
            minLength={2}
            value={f.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
        <div className="grid two" style={{ gap: 12 }}>
          <Field id="p-kind" label="Tipo">
            <select id="p-kind" value={f.kind} onChange={(e) => set("kind", e.target.value)}>
              {PRODUCT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {PRODUCT_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="p-unit" label="Unidade de controle">
            <select id="p-unit" value={f.unit} onChange={(e) => set("unit", e.target.value)}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABEL[u]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {f.kind === "semen" ? (
          <Field id="p-sire" label="Touro" hint="nome ou registro">
            <input
              id="p-sire"
              value={f.sireName}
              onChange={(e) => set("sireName", e.target.value)}
            />
          </Field>
        ) : null}
        <Field id="p-min" label="Estoque mínimo" hint="opcional; gera alerta">
          <input
            id="p-min"
            inputMode="decimal"
            value={f.minStock}
            onChange={(e) => set("minStock", e.target.value)}
          />
        </Field>
        <h2 style={{ fontSize: 18, margin: "16px 0 4px" }}>Carência</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Preencha somente com prazo confirmado na bula ou pelo responsável técnico. Em branco, o
          Rebania mostra “carência não configurada” — nunca assume zero.
        </p>
        <div className="grid two" style={{ gap: 12 }}>
          <Field id="p-meat" label="Carne (dias)">
            <input
              id="p-meat"
              inputMode="numeric"
              value={f.meat}
              onChange={(e) => set("meat", e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Field id="p-milk" label="Leite (dias)">
            <input
              id="p-milk"
              inputMode="numeric"
              value={f.milk}
              onChange={(e) => set("milk", e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        </div>
        <Field id="p-src" label="Fonte da carência" error={sourceError}>
          <input
            id="p-src"
            placeholder="Ex.: bula do fabricante, conferida por Dra. Ana (CRMV)"
            value={f.source}
            onChange={(e) => set("source", e.target.value)}
          />
        </Field>
        <Field id="p-notes" label="Observações" hint="opcional">
          <input id="p-notes" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        <div className="actions">
          <button className="btn btn-primary btn-lg" disabled={busy || Boolean(sourceError)}>
            {busy ? "Salvando…" : "Salvar produto"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => onDone(product?.id)}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}

function ProductDetail({
  product: p,
  onChange,
  onBack,
}: {
  product: ProductDto;
  onChange: () => void;
  onBack: () => void;
}) {
  const { farm, can } = useSession();
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [movements, setMovements] = useState<StockMovementDto[] | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    get<{ items: StockMovementDto[] }>(
      `/v1/farms/${farm!.id}/stock/movements?productId=${p.id}`,
    ).then(
      (r) => setMovements(r.items),
      () => setMovements([]),
    );
  }, [farm, p.id, tick]);

  if (editing)
    return (
      <ProductForm
        product={p}
        onDone={() => {
          setEditing(false);
          onChange();
        }}
      />
    );
  if (moving)
    return (
      <MovementForm
        product={p}
        onDone={() => {
          setMoving(false);
          setTick((n) => n + 1);
          onChange();
        }}
      />
    );

  return (
    <section>
      <PageHead title={p.name} onBack={onBack} />
      <div className="stats">
        <div className="stat">
          <div>
            <strong style={{ color: p.balance < 0 ? "var(--color-danger)" : undefined }}>
              {formatQuantity(p.balance, p.unit)}
            </strong>
            <span>Saldo</span>
          </div>
        </div>
        <div className="stat">
          <div>
            <strong>{p.minStock !== null ? formatQuantity(p.minStock, p.unit) : "—"}</strong>
            <span>Mínimo</span>
          </div>
        </div>
        <div className="stat">
          <div>
            <strong>{PRODUCT_KIND_LABEL[p.kind]}</strong>
            <span>Tipo</span>
          </div>
        </div>
      </div>
      <p className="hint">{withdrawalText(p)}</p>
      <div className="actions" style={{ marginTop: 0 }}>
        {can("stock.manage") ? (
          <button className="btn btn-primary" onClick={() => setMoving(true)}>
            <PackagePlus size={20} aria-hidden="true" /> Movimentar estoque
          </button>
        ) : null}
        {can("stock.manage") || can("health.manage") ? (
          <button className="btn btn-secondary" onClick={() => setEditing(true)}>
            Editar produto
          </button>
        ) : null}
        {p.kind !== "semen" && p.kind !== "feed" ? (
          <Link className="btn btn-ghost" to="/registrar/aplicacao">
            Registrar aplicação
          </Link>
        ) : null}
      </div>
      <h2 style={{ fontSize: 20 }}>Lotes / partidas</h2>
      {p.batches.length === 0 ? (
        <p className="hint">Nenhum lote informado nas entradas.</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Lote</th>
              <th>Validade</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {p.batches.map((b) => (
              <tr key={b.id} style={{ cursor: "default" }}>
                <td>{b.code}</td>
                <td>{formatDate(b.expiresOn)}</td>
                <td>{formatQuantity(b.balance, p.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2 style={{ fontSize: 20, marginTop: 24 }}>Movimentos</h2>
      {!movements ? (
        <Loading />
      ) : movements.length === 0 ? (
        <p className="hint">Sem movimentos.</p>
      ) : (
        <MovementTable items={movements} />
      )}
    </section>
  );
}

function MovementTable({ items }: { items: StockMovementDto[] }) {
  const source: Record<string, string> = {
    health_application: "Aplicação",
    breeding: "Inseminação",
    manual: "Lançamento",
  };
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Data</th>
          <th>Movimento</th>
          <th>Qtd.</th>
          <th>Origem</th>
        </tr>
      </thead>
      <tbody>
        {items.map((m) => (
          <tr
            key={m.id}
            style={{ cursor: "default", opacity: m.voided ? 0.5 : 1 }}
            title={m.note ?? undefined}
          >
            <td>{formatDate(m.occurredOn)}</td>
            <td>
              {STOCK_MOVEMENT_LABEL[m.kind]}
              {m.voided ? " (estornado)" : ""}
              {m.needsReview ? (
                <TriangleAlert
                  size={16}
                  aria-label="Aguardando conferência"
                  style={{ marginLeft: 6, color: "var(--color-warning)" }}
                />
              ) : null}
            </td>
            <td>{formatQuantity(m.quantity, m.unit)}</td>
            <td>
              {source[m.sourceType ?? ""] ?? "—"}
              {m.batchCode ? ` · ${m.batchCode}` : ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MovementForm({ product: p, onDone }: { product: ProductDto; onDone: () => void }) {
  const { farm } = useSession();
  const today = todayInTimezone(farm!.timezone);
  const [f, setF] = useState({
    kind: "entry" as StockMovementKind,
    quantity: "",
    batchId: "",
    batchCode: "",
    expiresOn: "",
    unitCost: "",
    occurredOn: today,
    note: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const q = num(f.quantity);
  const qtyError =
    f.quantity && (q === null || (f.kind !== "adjustment" && q <= 0) || q === 0)
      ? "Quantidade inválida."
      : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (q === null || qtyError) return;
    setBusy(true);
    setError(null);
    try {
      await post(
        `/v1/farms/${farm!.id}/stock/movements`,
        {
          productId: p.id,
          kind: f.kind,
          quantity: q,
          occurredOn: f.occurredOn,
          ...(f.batchId ? { batchId: f.batchId } : {}),
          ...(!f.batchId && f.batchCode.trim() && f.kind === "entry"
            ? { batchCode: f.batchCode.trim(), expiresOn: f.expiresOn || null }
            : {}),
          ...(num(f.unitCost) !== null && f.kind === "entry" ? { unitCost: num(f.unitCost) } : {}),
          ...(f.note.trim() ? { note: f.note.trim() } : {}),
        },
        { idempotencyKey: key },
      );
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHead title={`Movimentar · ${p.name}`} onBack={onDone} />
      <form className="card" onSubmit={submit}>
        {error ? <Alert kind="danger">{error}</Alert> : null}
        <div className="field">
          <label>Movimento</label>
          <div className="seg" role="radiogroup" aria-label="Tipo de movimento">
            {(["entry", "loss", "adjustment", "consumption"] as const).map((k) => (
              <label key={k}>
                <input
                  type="radio"
                  name="mk"
                  checked={f.kind === k}
                  onChange={() => set("kind", k)}
                />{" "}
                {STOCK_MOVEMENT_LABEL[k]}
              </label>
            ))}
          </div>
        </div>
        <Field
          id="m-q"
          label={`Quantidade (${p.unit})`}
          hint={f.kind === "adjustment" ? "negativa para reduzir" : undefined}
          error={qtyError}
        >
          <input
            id="m-q"
            required
            inputMode="decimal"
            value={f.quantity}
            onChange={(e) => set("quantity", e.target.value)}
          />
        </Field>
        <Field id="m-batch" label="Lote / partida">
          <select id="m-batch" value={f.batchId} onChange={(e) => set("batchId", e.target.value)}>
            <option value="">
              {f.kind === "entry" ? "Novo lote ou não informado" : "Não informado"}
            </option>
            {p.batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code}
                {b.expiresOn ? ` · vence ${formatDate(b.expiresOn)}` : ""}
              </option>
            ))}
          </select>
        </Field>
        {f.kind === "entry" && !f.batchId ? (
          <div className="grid two" style={{ gap: 12 }}>
            <Field id="m-code" label="Código do novo lote" hint="opcional">
              <input
                id="m-code"
                value={f.batchCode}
                onChange={(e) => set("batchCode", e.target.value)}
              />
            </Field>
            <Field id="m-exp" label="Validade" hint="opcional">
              <input
                id="m-exp"
                type="date"
                value={f.expiresOn}
                onChange={(e) => set("expiresOn", e.target.value)}
              />
            </Field>
          </div>
        ) : null}
        <div className="grid two" style={{ gap: 12 }}>
          <Field id="m-date" label="Data">
            <input
              id="m-date"
              type="date"
              max={today}
              value={f.occurredOn}
              onChange={(e) => set("occurredOn", e.target.value)}
            />
          </Field>
          {f.kind === "entry" ? (
            <Field id="m-cost" label={`Custo por ${p.unit}`} hint="opcional, R$">
              <input
                id="m-cost"
                inputMode="decimal"
                value={f.unitCost}
                onChange={(e) => set("unitCost", e.target.value)}
              />
            </Field>
          ) : null}
        </div>
        <Field
          id="m-note"
          label="Observação"
          hint={f.kind === "adjustment" ? "obrigatória no ajuste" : "opcional"}
        >
          <input
            id="m-note"
            required={f.kind === "adjustment"}
            value={f.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </Field>
        <div className="actions">
          <button className="btn btn-primary btn-lg" disabled={busy || q === null}>
            {busy ? "Registrando…" : "Registrar movimento"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}

function ReviewList({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { farm } = useSession();
  const [items, setItems] = useState<StockMovementDto[] | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    get<{ items: StockMovementDto[] }>(`/v1/farms/${farm!.id}/stock/movements?review=1`).then(
      (r) => setItems(r.items),
      () => setItems([]),
    );
  }, [farm, tick]);
  if (!items) return <Loading />;
  return (
    <section>
      <PageHead title="Conferência de estoque" onBack={onBack} />
      <p className="hint">
        Consumos registrados em campo que deixaram o saldo negativo. Confira a nota/entrada ou lance
        um ajuste justificado; a aplicação continua no histórico do animal.
      </p>
      {items.length === 0 ? (
        <Empty title="Nada para conferir" icon={<ClipboardCheck size={40} aria-hidden="true" />} />
      ) : (
        <ul className="list">
          {items.map((m) => (
            <li key={m.id} className="list-item">
              <span>
                <span className="title">
                  {m.productName} · {formatQuantity(m.quantity, m.unit)}
                </span>
                <div className="meta">
                  {formatDate(m.occurredOn)} · {m.actorName ?? "—"}
                </div>
              </span>
              <button
                className="btn btn-soft"
                onClick={async () => {
                  await post(`/v1/farms/${farm!.id}/stock/movements/${m.id}/review`, {});
                  setTick((n) => n + 1);
                  onDone();
                }}
              >
                Conferido
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
