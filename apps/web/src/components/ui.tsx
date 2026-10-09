import type { ReactNode } from "react";

export function Steps({ current }: { current: 1 | 2 | 3 }) {
  const labels = ["Identificar", "Informar", "Confirmar"];
  return (
    <ol className="steps" aria-label="Etapas">
      {labels.map((l, i) => {
        const n = i + 1;
        return (
          <li key={l} aria-current={n === current ? "step" : undefined} className={n < current ? "done" : undefined}>
            <span className="n" aria-hidden="true">{n < current ? "✓" : n}</span>
            {l}
          </li>
        );
      })}
    </ol>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {hint ? <span className="hint">({hint})</span> : null}
      </label>
      {children}
      {error ? (
        <div className="field-error" id={`${id}-error`} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export function Alert({ kind, children }: { kind: "success" | "warning" | "danger" | "info"; children: ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === "danger" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Loading({ label = "Carregando…" }: { label?: string }) {
  return (
    <p className="hint" role="status" aria-live="polite">
      {label}
    </p>
  );
}

export function formatDate(civil: string | null | undefined): string {
  if (!civil) return "—";
  const [y, m, d] = civil.split("-");
  return `${d}/${m}/${y}`;
}

export function formatKg(v: number): string {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
