import { CircleAlert, CloudCheck, CloudOff, CloudUpload, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router";
import { useSync } from "../state/sync.tsx";
import { formatDateTime } from "./ui.tsx";

/**
 * Estado ÚNICO e coerente de conectividade/sincronização por sessão
 * (MN §14: as pranchas mostravam estados contraditórios).
 */
export function SyncBadge({ compact = false }: { compact?: boolean }) {
  const { state } = useSync();
  const navigate = useNavigate();
  const problems = state.rejected + state.conflict;
  let color = "var(--color-success)";
  let text = "Sincronizado";
  let Icon = CloudCheck;
  if (problems > 0) {
    color = "var(--color-danger)";
    text = `${problems} para revisar`;
    Icon = CircleAlert;
  } else if (!state.online) {
    color = "var(--color-warning)";
    text = state.pending ? `Sem internet · ${state.pending} salvo(s) no aparelho` : "Sem internet";
    Icon = CloudOff;
  } else if (state.phase === "syncing") {
    color = "var(--color-info)";
    text = "Sincronizando…";
    Icon = RefreshCw;
  } else if (state.pending) {
    color = "var(--color-warning)";
    text = `${state.pending} aguardando envio`;
    Icon = CloudUpload;
  } else if (state.phase === "error") {
    color = "var(--color-danger)";
    text = "Falha ao sincronizar";
    Icon = CircleAlert;
  }
  return (
    <button
      type="button"
      className={`sync-status ${compact ? "compact" : ""}`}
      style={{ borderColor: color, color }}
      onClick={() => navigate("/fazenda/sincronizacao")}
      title={`${text} · Última sincronização: ${formatDateTime(state.lastSyncAt)}`}
      aria-label={`${text}. Última sincronização: ${formatDateTime(state.lastSyncAt)}`}
      aria-live="polite"
    >
      <Icon size={18} aria-hidden="true" />
      <span className="txt">{text}</span>
    </button>
  );
}
