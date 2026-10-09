import {
  ASSISTANCE_LABEL,
  BREEDING_LABEL,
  PREGNANCY_LABEL,
  type Assistance,
  type BreedingKind,
  type PregnancyResultValue,
} from "@rebania/domain";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { errorMessage, get, post } from "../api/client.ts";
import { useSession } from "../state/session.tsx";
import { useSync } from "../state/sync.tsx";
import { Alert, formatDate, Loading } from "./ui.tsx";

interface ReproData {
  projection: {
    status: string;
    expectedCalving: {
      date: string;
      windowStart: string;
      windowEnd: string;
      source: string;
    } | null;
  };
  breedings: {
    id: string;
    kind: BreedingKind;
    date: string;
    endDate: string | null;
    semen: string | null;
    technician: string | null;
    voidedAt: string | null;
    voidReason: string | null;
  }[];
  checks: {
    id: string;
    date: string;
    result: PregnancyResultValue;
    examiner: string | null;
    estimatedGestationDays: number | null;
    voidedAt: string | null;
    voidReason: string | null;
  }[];
  births: {
    id: string;
    date: string;
    assistance: Assistance;
    calves: { animalId: string | null; sex: string; stillborn: boolean }[];
  }[];
}

/** Histórico reprodutivo com correção rastreável (anular cria evento e recalcula a situação). */
export function ReproSection({ animalId }: { animalId: string }) {
  const { farm, can } = useSession();
  const { engine } = useSync();
  const [data, setData] = useState<ReproData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      get<ReproData>(`/v1/farms/${farm!.id}/animals/${animalId}/repro`).then(setData, (e) =>
        setError(errorMessage(e)),
      ),
    [farm, animalId],
  );
  useEffect(() => void load(), [load]);

  const voidIt = async (kind: "breeding" | "pregnancy_check", id: string) => {
    const reason = prompt("Motivo da correção (fica no histórico):");
    if (!reason || reason.trim().length < 3) return;
    try {
      await post(`/v1/farms/${farm!.id}/corrections`, { kind, id, reason });
      await load();
      void engine.syncNow();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (error) return <Alert kind="info">Histórico reprodutivo disponível com conexão.</Alert>;
  if (!data) return <Loading />;
  const ec = data.projection.expectedCalving;
  const canFix = can("events.write");
  const voided = (v: string | null, reason: string | null) =>
    v ? (
      <span className="badge badge-muted" title={reason ?? ""}>
        anulado
      </span>
    ) : null;

  return (
    <div>
      <h2 style={{ marginTop: 24 }}>Reprodução</h2>
      {ec ? (
        <Alert kind="info">
          Parto previsto para {formatDate(ec.date)} (entre {formatDate(ec.windowStart)} e{" "}
          {formatDate(ec.windowEnd)}). Estimativa — {ec.source}.
        </Alert>
      ) : null}
      <ul className="list">
        {data.births.map((b) => (
          <li key={b.id} className="list-item">
            <span>
              <span className="title">Parto · {formatDate(b.date)}</span>
              <div className="meta">
                {ASSISTANCE_LABEL[b.assistance]} ·{" "}
                {b.calves.map((c, i) => (
                  <span key={i}>
                    {i ? ", " : ""}
                    {c.stillborn ? (
                      `natimorto (${c.sex === "male" ? "M" : "F"})`
                    ) : c.animalId ? (
                      <Link to={`/rebanho/${c.animalId}`}>cria {c.sex === "male" ? "M" : "F"}</Link>
                    ) : (
                      ""
                    )}
                  </span>
                ))}
              </div>
            </span>
          </li>
        ))}
        {data.checks.map((c) => (
          <li key={c.id} className="list-item" style={{ opacity: c.voidedAt ? 0.6 : 1 }}>
            <span>
              <span className="title">
                Diagnóstico: {PREGNANCY_LABEL[c.result]} · {formatDate(c.date)}
              </span>{" "}
              {voided(c.voidedAt, c.voidReason)}
              <div className="meta">
                {c.examiner ?? "Responsável não informado"}
                {c.estimatedGestationDays ? ` · ${c.estimatedGestationDays} dias de gestação` : ""}
                {c.voidReason ? ` · correção: ${c.voidReason}` : ""}
              </div>
            </span>
            {canFix && !c.voidedAt ? (
              <button
                className="btn btn-ghost"
                onClick={() => void voidIt("pregnancy_check", c.id)}
              >
                Anular
              </button>
            ) : null}
          </li>
        ))}
        {data.breedings.map((b) => (
          <li key={b.id} className="list-item" style={{ opacity: b.voidedAt ? 0.6 : 1 }}>
            <span>
              <span className="title">
                {BREEDING_LABEL[b.kind]} · {formatDate(b.date)}
                {b.endDate ? ` a ${formatDate(b.endDate)}` : ""}
              </span>{" "}
              {voided(b.voidedAt, b.voidReason)}
              <div className="meta">
                {[b.semen ? `sêmen ${b.semen}` : null, b.technician].filter(Boolean).join(" · ") ||
                  "—"}
                {b.voidReason ? ` · correção: ${b.voidReason}` : ""}
              </div>
            </span>
            {canFix && !b.voidedAt ? (
              <button className="btn btn-ghost" onClick={() => void voidIt("breeding", b.id)}>
                Anular
              </button>
            ) : null}
          </li>
        ))}
        {!data.births.length && !data.checks.length && !data.breedings.length ? (
          <li className="hint">Nenhum registro reprodutivo.</li>
        ) : null}
      </ul>
    </div>
  );
}
