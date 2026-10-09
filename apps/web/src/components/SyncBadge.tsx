import { useNavigate } from "react-router";
import { useSync } from "../state/sync.tsx";
import { formatDateTime } from "./ui.tsx";

/**
 * Estado ÚNICO e coerente de conectividade/sincronização por sessão
 * (MN §14: as pranchas mostravam estados contraditórios).
 */
export function SyncBadge() {
  const { state } = useSync();
  const navigate = useNavigate();
  const problems = state.rejected + state.conflict;
  let color = "var(--color-success)";
  let text = "Sincronizado";
  if (problems > 0) {
    color = "var(--color-danger)";
    text = `${problems} ${problems === 1 ? "registro precisa" : "registros precisam"} de revisão`;
  } else if (!state.online) {
    color = "var(--color-warning)";
    text = state.pending ? `Sem internet · ${state.pending} salvo(s) no aparelho` : "Sem internet";
  } else if (state.phase === "syncing") {
    color = "var(--color-info)";
    text = "Sincronizando…";
  } else if (state.pending) {
    color = "var(--color-warning)";
    text = `${state.pending} aguardando envio`;
  } else if (state.phase === "error") {
    color = "var(--color-danger)";
    text = "Falha ao sincronizar";
  }
  return (
    <button
      type="button"
      className="sync-status"
      style={{ borderColor: color, color }}
      onClick={() => navigate("/fazenda/sincronizacao")}
      title={`Última sincronização: ${formatDateTime(state.lastSyncAt)}`}
      aria-live="polite"
    >
      <span className="dot" style={{ background: color }} aria-hidden="true" />
      {text}
    </button>
  );
}
