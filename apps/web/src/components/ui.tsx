import { ArrowLeft, Check, CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { BrandCow } from "./brand.tsx";
import type { ReactNode } from "react";
import { Link } from "react-router";

export function Steps({
  current,
  labels = ["Identificar", "Informar", "Confirmar"],
}: {
  current: 1 | 2 | 3;
  labels?: [string, string, string];
}) {
  return (
    <ol className="steps" aria-label="Etapas">
      {labels.map((l, i) => {
        const n = i + 1;
        return [
          i > 0 ? (
            <span
              key={`b${n}`}
              className={`bar ${n <= current ? "done" : ""}`}
              aria-hidden="true"
            />
          ) : null,
          <li
            key={l}
            aria-current={n === current ? "step" : undefined}
            className={n < current ? "done" : undefined}
          >
            <span className="n" aria-hidden="true">
              {n < current ? <Check size={16} /> : n}
            </span>
            {l}
          </li>,
        ];
      })}
    </ol>
  );
}

export function PageHead({
  title,
  back,
  aside,
}: {
  title: string;
  back?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="page-head">
      {back ? (
        <Link to={back} className="back" aria-label="Voltar">
          <ArrowLeft size={26} />
        </Link>
      ) : null}
      <h1>{title}</h1>
      {aside ? <div className="aside">{aside}</div> : null}
    </div>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  icon,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {hint ? <span className="hint">({hint})</span> : null}
      </label>
      {icon ? (
        <div className="input-icon">
          {icon}
          {children}
        </div>
      ) : (
        children
      )}
      {error ? (
        <div className="field-error" id={`${id}-error`} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

const ALERT_ICON = {
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
  info: Info,
} as const;

export function Alert({
  kind,
  children,
}: {
  kind: "success" | "warning" | "danger" | "info";
  children: ReactNode;
}) {
  const Icon = ALERT_ICON[kind];
  return (
    <div className={`alert alert-${kind}`} role={kind === "danger" ? "alert" : "status"}>
      <Icon size={22} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function Empty({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon}
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

/** Foto do animal (rota autenticada) ou ilustração neutra quando ainda não há foto. */
export function AnimalPhoto({
  size = "list",
  src,
}: {
  size?: "list" | "sm" | "md";
  src?: string | null;
}) {
  if (src) {
    return (
      <img
        className={`photo ${size === "list" ? "" : size}`}
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <div className={`photo ${size === "list" ? "" : size}`} aria-hidden="true">
      <BrandCow size={size === "sm" ? 26 : size === "md" ? 40 : 46} />
    </div>
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

/** Idade legível: "4 meses", "5 anos". */
export function ageLabel(months: number): string {
  if (months < 24) return `${months} ${months === 1 ? "mês" : "meses"}`;
  return `${Math.floor(months / 12)} anos`;
}

/** Selo de situação como nas pranchas: Prenha · Vazia · Inseminada · Reprodutor · Ativo. */
export function StatusBadge({
  animal,
}: {
  animal: { status: string; category: string; pending?: boolean; repro: { status: string } | null };
}) {
  if (animal.pending) return <span className="badge badge-warn">no aparelho</span>;
  if (animal.status !== "active") return <span className="badge badge-muted">Inativo</span>;
  if (animal.category === "bull") return <span className="badge badge-info">Reprodutor</span>;
  switch (animal.repro?.status) {
    case "pregnant":
      return <span className="badge badge-ok">Prenha</span>;
    case "open":
      return <span className="badge badge-warn">Vazia</span>;
    case "bred":
      return <span className="badge badge-info">Inseminada</span>;
    default:
      return <span className="badge badge-ok">Ativo</span>;
  }
}
