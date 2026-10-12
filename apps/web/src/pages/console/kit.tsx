import { formatBRL } from "@rebania/domain";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { errorMessage, get } from "../../api/client.ts";
import { Alert, Loading } from "../../components/ui.tsx";

export const brl = (cents: number | null | undefined) => (cents == null ? "—" : formatBRL(cents));

/** Carrega um recurso do console com recarga explícita. */
export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setError(null);
    get<T>(path).then(
      (d) => alive && setData(d),
      (e) => alive && setError(errorMessage(e)),
    );
    return () => {
      alive = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, error, reload, setData };
}

export function Loaded<T>({
  r,
  children,
}: {
  r: { data: T | null; error: string | null };
  children: (d: T) => ReactNode;
}) {
  if (r.error && !r.data) return <Alert kind="danger">{r.error}</Alert>;
  if (!r.data) return <Loading />;
  return <>{children(r.data)}</>;
}

// ---- Quem está no console (papel e permissões) ----
export interface StaffMe {
  isPlatformAdmin: boolean;
  role?: "admin" | "finance" | "support" | "onboarding";
  permissions?: string[];
}
export const StaffContext = createContext<StaffMe | null>(null);
export function useStaff() {
  const me = useContext(StaffContext);
  return {
    me,
    can: (p: string) => Boolean(me?.permissions?.includes(p)),
  };
}

// ---- Selos ----
const STAGE: Record<string, [string, string]> = {
  lead: ["Negociação", "badge-muted"],
  onboarding: ["Em implantação", "badge-info"],
  active: ["Ativo", "badge-ok"],
  suspended: ["Suspenso", "badge-warn"],
  churned: ["Encerrado", "badge-danger"],
};
export const STAGE_LABEL = Object.fromEntries(Object.entries(STAGE).map(([k, [l]]) => [k, l]));
export function StageBadge({ stage }: { stage: string }) {
  const [label, cls] = STAGE[stage] ?? [stage, "badge-muted"];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function AccessBadge({ mode }: { mode: string }) {
  return mode === "read_only" ? <span className="badge badge-danger">somente leitura</span> : null;
}

const INVOICE: Record<string, [string, string]> = {
  pending: ["A vencer", "badge-muted"],
  overdue: ["Vencida", "badge-danger"],
  paid: ["Paga", "badge-ok"],
  failed: ["Falhou", "badge-danger"],
  cancelled: ["Cancelada", "badge-muted"],
};
export function InvoiceBadge({ status }: { status: string }) {
  const [label, cls] = INVOICE[status] ?? [status, "badge-muted"];
  return <span className={`badge ${cls}`}>{label}</span>;
}
export const INVOICE_KIND: Record<string, string> = {
  implementation: "Implantação",
  monthly: "Mensalidade",
  credits: "Créditos",
  other: "Avulsa",
};

const TICKET: Record<string, [string, string]> = {
  open: ["Aguardando equipe", "badge-warn"],
  waiting_customer: ["Aguardando cliente", "badge-info"],
  resolved: ["Resolvido", "badge-ok"],
  closed: ["Fechado", "badge-muted"],
};
export function TicketBadge({ status }: { status: string }) {
  const [label, cls] = TICKET[status] ?? [status, "badge-muted"];
  return <span className={`badge ${cls}`}>{label}</span>;
}
export const PRIORITY_LABEL: Record<string, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};
export const CHANNEL_LABEL: Record<string, string> = {
  app: "App",
  whatsapp: "WhatsApp",
  email: "E-mail",
  phone: "Telefone",
  other: "Outro",
};
export function SlaBadge({ state }: { state: string }) {
  if (state === "breached") return <span className="badge badge-danger">prazo estourado</span>;
  if (state === "at_risk") return <span className="badge badge-warn">prazo perto</span>;
  return null;
}

export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  finance: "Financeiro",
  support: "Suporte",
  onboarding: "Implantação",
};

// ---- Blocos ----
export function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; hidden?: boolean }[];
  value: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="tabs console-tabs" role="tablist">
      {tabs
        .filter((t) => !t.hidden)
        .map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={value === t.id}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        ))}
    </div>
  );
}

/** Formulário em cartão com erro e envio assíncrono. */
export function CardForm({
  title,
  submitLabel,
  onSubmit,
  onCancel,
  bare = false,
  canSubmit = true,
  children,
}: {
  title?: string;
  /** Falso enquanto falta algo antes de enviar (o botão some; Cancelar fica). */
  canSubmit?: boolean;
  /** Sem moldura de cartão (quando já está dentro de um). */
  bare?: boolean;
  submitLabel: string;
  onSubmit: () => Promise<void>;
  onCancel?: () => void;
  children: ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={bare ? undefined : "card"} onSubmit={submit} style={{ marginBottom: 16 }}>
      {title ? <h2 style={{ marginTop: 0, fontSize: 18 }}>{title}</h2> : null}
      {error ? <Alert kind="danger">{error}</Alert> : null}
      {children}
      <div className="actions">
        {canSubmit ? (
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Salvando…" : submitLabel}
          </button>
        ) : null}
        {onCancel ? (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** Ação com motivo obrigatório (auditoria). Devolve null se a pessoa cancelar. */
export function askReason(question: string, min = 3): string | null {
  const r = window.prompt(question);
  if (r === null) return null;
  if (r.trim().length < min) {
    window.alert(`Informe um motivo com ao menos ${min} caracteres.`);
    return null;
  }
  return r.trim();
}

export function RunButton({
  label,
  run,
  className = "btn btn-ghost",
  confirmText,
}: {
  label: ReactNode;
  run: () => Promise<unknown>;
  className?: string;
  confirmText?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        if (confirmText && !window.confirm(confirmText)) return;
        setBusy(true);
        try {
          await run();
        } catch (err) {
          window.alert(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </button>
  );
}

export const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Porto_Velho",
  "America/Manaus",
  "America/Rio_Branco",
  "America/Belem",
  "America/Araguaina",
  "America/Bahia",
];

export const todayCivil = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
