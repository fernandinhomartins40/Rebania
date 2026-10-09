import {
  ADMIN_ROUTE_LABEL,
  EXAM_KIND_LABEL,
  formatQuantity,
  HEALTH_KIND_LABEL,
  TREATMENT_STATUS_LABEL,
  type ExamKind,
} from "@rebania/domain";
import type { HealthApplicationDto } from "@rebania/contracts";
import { Syringe } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { errorMessage, get, post } from "../api/client.ts";
import { useSession } from "../state/session.tsx";
import { useSync } from "../state/sync.tsx";
import { Alert, formatDate } from "./ui.tsx";

interface Status {
  inWithdrawal: boolean;
  until: string | null;
  daysLeft: number;
}
interface AnimalHealth {
  withdrawal: { meat: Status; milk: Status };
  applications: HealthApplicationDto[];
  treatments: {
    id: string;
    condition: string;
    startedOn: string;
    status: "open" | "resolved" | "failed";
    outcome: string | null;
    endedOn: string | null;
  }[];
  exams: {
    id: string;
    kind: string;
    collectedOn: string;
    status: "pending" | "done";
    result: string | null;
    resultOn: string | null;
  }[];
}

/** Sanidade no passaporte: carência, aplicações (com correção), tratamentos e exames. */
export function HealthSection({ animalId, active }: { animalId: string; active: boolean }) {
  const { farm, can } = useSession();
  const { version } = useSync();
  const [data, setData] = useState<AnimalHealth | null>(null);
  const [failed, setFailed] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    get<AnimalHealth>(`/v1/farms/${farm!.id}/animals/${animalId}/health`).then(
      (d) => {
        setData(d);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [farm, animalId, version, tick]);

  if (failed) return <Alert kind="info">Sanidade completa disponível com conexão.</Alert>;
  if (!data) return null;
  const { meat, milk } = data.withdrawal;
  return (
    <>
      <h2 style={{ marginTop: 24 }}>Sanidade</h2>
      {meat.inWithdrawal || milk.inWithdrawal ? (
        <Alert kind="warning">
          Em carência
          {meat.inWithdrawal ? ` · carne até ${formatDate(meat.until)}` : ""}
          {milk.inWithdrawal ? ` · leite até ${formatDate(milk.until)}` : ""}. A venda verifica esta
          pendência.
        </Alert>
      ) : null}
      {active && can("events.write") ? (
        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="btn btn-soft" to={`/registrar/aplicacao?animais=${animalId}`}>
            <Syringe size={18} aria-hidden="true" /> Registrar aplicação
          </Link>
          <Link className="btn btn-ghost" to={`/registrar/tratamento?animal=${animalId}`}>
            Iniciar tratamento
          </Link>
        </div>
      ) : null}
      {error ? <Alert kind="danger">{error}</Alert> : null}
      {data.applications.length === 0 ? (
        <p className="hint">Nenhuma aplicação registrada.</p>
      ) : (
        <ul className="list">
          {data.applications.map((a) => (
            <li
              key={a.id}
              className="list-item"
              style={{ display: "block", opacity: a.voided ? 0.55 : 1 }}
            >
              <span className="title">
                {a.productName}
                {a.voided ? <span className="badge badge-muted">anulada</span> : null}
              </span>
              <div className="meta">
                {formatDate(a.appliedOn)} · {HEALTH_KIND_LABEL[a.kind]}
                {a.dose !== null ? ` · ${formatQuantity(a.dose, a.unit ?? "")}` : ""}
                {a.route ? ` · ${ADMIN_ROUTE_LABEL[a.route]}` : ""}
                {a.batchCode ? ` · lote ${a.batchCode}` : ""}
                {a.applicator ? ` · ${a.applicator}` : ""}
              </div>
              <div className="meta">
                {a.withdrawalMeatUntil
                  ? `Carência de carne até ${formatDate(a.withdrawalMeatUntil)}`
                  : "Carência não configurada no produto"}
              </div>
              {!a.voided && can("events.write") ? (
                voiding === a.id ? (
                  <form
                    style={{ marginTop: 8 }}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setError(null);
                      try {
                        await post(`/v1/farms/${farm!.id}/health/applications/${a.id}/void`, {
                          reason: reason.trim(),
                        });
                        setVoiding(null);
                        setReason("");
                        setTick((n) => n + 1);
                      } catch (err) {
                        setError(errorMessage(err));
                      }
                    }}
                  >
                    <div className="field">
                      <label htmlFor={`void-${a.id}`}>Motivo da correção</label>
                      <input
                        id={`void-${a.id}`}
                        required
                        minLength={3}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </div>
                    <div className="actions" style={{ marginTop: 0 }}>
                      <button className="btn btn-secondary">Anular aplicação</button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setVoiding(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <button className="link-btn" onClick={() => setVoiding(a.id)}>
                    Corrigir
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {data.treatments.length ? (
        <>
          <h3 style={{ margin: "16px 0 6px" }}>Tratamentos</h3>
          <ul className="list">
            {data.treatments.map((t) => (
              <li key={t.id} className="list-item">
                <span>
                  <span className="title">{t.condition}</span>
                  <div className="meta">
                    {formatDate(t.startedOn)}
                    {t.endedOn ? ` a ${formatDate(t.endedOn)}` : ""} ·{" "}
                    {TREATMENT_STATUS_LABEL[t.status]}
                    {t.outcome ? ` · ${t.outcome}` : ""}
                  </div>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {data.exams.length ? (
        <>
          <h3 style={{ margin: "16px 0 6px" }}>Exames</h3>
          <ul className="list">
            {data.exams.map((e) => (
              <li key={e.id} className="list-item">
                <span>
                  <span className="title">
                    {EXAM_KIND_LABEL[e.kind as ExamKind] ?? e.kind}:{" "}
                    {e.status === "done" ? e.result : "aguardando resultado"}
                  </span>
                  <div className="meta">
                    Coleta {formatDate(e.collectedOn)}
                    {e.resultOn ? ` · resultado ${formatDate(e.resultOn)}` : ""}
                  </div>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
