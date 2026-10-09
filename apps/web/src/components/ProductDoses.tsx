import type { ProductDto } from "@rebania/contracts";
import {
  ADMIN_ROUTE_LABEL,
  ADMIN_ROUTES,
  formatQuantity,
  PRODUCT_KIND_LABEL,
  type AdminRoute,
} from "@rebania/domain";
import { Plus, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { formatDate } from "./ui.tsx";

export interface DoseRow {
  productId: string;
  batchId: string;
  dose: string;
  route: AdminRoute | "";
}

export const emptyDose = (): DoseRow => ({ productId: "", batchId: "", dose: "", route: "" });

export function parseDose(v: string): number | null {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : null;
}

export function doseRowsValid(rows: DoseRow[]) {
  return rows.length > 0 && rows.every((r) => r.productId && parseDose(r.dose) !== null);
}

export function toApplicationProducts(rows: DoseRow[]) {
  return rows.map((r) => ({
    productId: r.productId,
    dose: parseDose(r.dose)!,
    ...(r.batchId ? { batchId: r.batchId } : {}),
    ...(r.route ? { route: r.route } : {}),
  }));
}

/** Texto de carência do produto: nunca presume prazo não configurado. */
export function withdrawalText(p: ProductDto | undefined) {
  if (!p) return "";
  if (p.withdrawalMeatDays === null && p.withdrawalMilkDays === null)
    return "Carência não configurada para este produto.";
  const parts = [
    p.withdrawalMeatDays !== null ? `carne ${p.withdrawalMeatDays} dia(s)` : null,
    p.withdrawalMilkDays !== null ? `leite ${p.withdrawalMilkDays} dia(s)` : null,
  ].filter(Boolean);
  return `Carência: ${parts.join(" · ")} (fonte: ${p.withdrawalSource ?? "—"}).`;
}

/** Produtos, lote, dose e via. A dose é sempre na unidade cadastrada do produto. */
export function ProductDoses({
  products,
  rows,
  onChange,
  date,
  canManageStock,
}: {
  products: ProductDto[];
  rows: DoseRow[];
  onChange: (rows: DoseRow[]) => void;
  date: string;
  canManageStock: boolean;
}) {
  const usable = products.filter((p) => !p.archived && p.kind !== "semen" && p.kind !== "feed");
  const set = (i: number, patch: Partial<DoseRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  if (!usable.length) {
    return (
      <div className="card" style={{ background: "var(--color-surface-muted, #f3efe6)" }}>
        <p style={{ margin: 0 }}>
          Nenhum produto cadastrado no estoque.{" "}
          {canManageStock ? (
            <Link to="/fazenda/estoque?novo=1">Cadastrar produto</Link>
          ) : (
            "Peça ao gerente para cadastrar."
          )}
        </p>
      </div>
    );
  }
  return (
    <div>
      {rows.map((r, i) => {
        const p = usable.find((x) => x.id === r.productId);
        const batches = (p?.batches ?? []).filter((b) => !b.expiresOn || b.expiresOn >= date);
        const doseOk = !r.dose || parseDose(r.dose) !== null;
        return (
          <fieldset key={i} className="dose-row">
            <legend className="visually-hidden">Produto {i + 1}</legend>
            <div className="field">
              <label htmlFor={`pd-p-${i}`}>Produto</label>
              <select
                id={`pd-p-${i}`}
                value={r.productId}
                onChange={(e) => set(i, { productId: e.target.value, batchId: "" })}
              >
                <option value="">Selecione…</option>
                {usable.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} · {PRODUCT_KIND_LABEL[x.kind]} · saldo{" "}
                    {formatQuantity(x.balance, x.unit)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid two" style={{ gap: 12 }}>
              <div className="field">
                <label htmlFor={`pd-d-${i}`}>
                  Dose por animal {p ? <span className="hint">({p.unit})</span> : null}
                </label>
                <input
                  id={`pd-d-${i}`}
                  inputMode="decimal"
                  value={r.dose}
                  onChange={(e) => set(i, { dose: e.target.value.replace(/[^\d.,]/g, "") })}
                  aria-invalid={!doseOk}
                />
                {!doseOk ? <div className="field-error">Dose inválida.</div> : null}
              </div>
              <div className="field">
                <label htmlFor={`pd-r-${i}`}>Via</label>
                <select
                  id={`pd-r-${i}`}
                  value={r.route}
                  onChange={(e) => set(i, { route: e.target.value as AdminRoute | "" })}
                >
                  <option value="">Não informada</option>
                  {ADMIN_ROUTES.map((v) => (
                    <option key={v} value={v}>
                      {ADMIN_ROUTE_LABEL[v]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {p ? (
              <div className="field">
                <label htmlFor={`pd-b-${i}`}>Lote / validade</label>
                <select
                  id={`pd-b-${i}`}
                  value={r.batchId}
                  onChange={(e) => set(i, { batchId: e.target.value })}
                >
                  <option value="">Não informado</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code}
                      {b.expiresOn ? ` · vence ${formatDate(b.expiresOn)}` : ""} · saldo{" "}
                      {formatQuantity(b.balance, p.unit)}
                    </option>
                  ))}
                </select>
                <p className="hint" style={{ margin: "6px 0 0" }}>
                  {withdrawalText(p)}
                </p>
              </div>
            ) : null}
            {rows.length > 1 ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
              >
                <Trash2 size={18} aria-hidden="true" /> Remover produto
              </button>
            ) : null}
          </fieldset>
        );
      })}
      {rows.length < 5 ? (
        <button
          type="button"
          className="btn btn-soft"
          onClick={() => onChange([...rows, emptyDose()])}
        >
          <Plus size={18} aria-hidden="true" /> Outro produto no mesmo manejo
        </button>
      ) : null}
    </div>
  );
}
