import { Link } from "react-router";
import type { SubmitResult } from "../offline/engine.ts";
import { Alert } from "../components/ui.tsx";

/** Resultado de uma confirmação: diferencia "sincronizado" de "salvo no aparelho". */
export function SubmitOutcome({
  result,
  successText,
  next,
  restart,
}: {
  result: SubmitResult;
  successText: string;
  next: { to: string; label: string }[];
  /** Reinicia a mesma jornada (ex.: pesar o próximo animal). */
  restart?: { label: string; onClick: () => void };
}) {
  return (
    <div>
      {result.status === "synced" ? (
        <Alert kind="success">{successText} e sincronizado.</Alert>
      ) : result.status === "saved_locally" ? (
        <Alert kind="warning">Salvo no aparelho. Enviaremos quando houver conexão.</Alert>
      ) : (
        <Alert kind="danger">
          {result.status === "conflict" ? "Conflito: " : "Não registrado: "}
          {result.message} <Link to="/fazenda/sincronizacao">Revisar pendências</Link>
        </Alert>
      )}
      <div className="actions">
        {restart ? (
          <button type="button" className="btn btn-primary" onClick={restart.onClick} autoFocus>
            {restart.label}
          </button>
        ) : null}
        {next.map((n, i) => (
          <Link key={n.to} to={n.to} className={`btn ${i === 0 && !restart ? "btn-primary" : "btn-secondary"}`}>
            {n.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
