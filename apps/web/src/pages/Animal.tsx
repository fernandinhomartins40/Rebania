import type { AnimalHistory } from "@rebania/contracts";
import { ageInMonths, CATEGORY_LABEL, IDENTIFIER_LABEL, SEX_LABEL, STATUS_LABEL, todayInTimezone } from "@rebania/domain";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { errorMessage, get } from "../api/client.ts";
import { Alert, Empty, formatDate, formatKg, Loading } from "../components/ui.tsx";
import { useLocalAnimal } from "../state/local-data.ts";
import { useSession } from "../state/session.tsx";
import { useSync } from "../state/sync.tsx";
import { RetagPanel } from "./Retag.tsx";

const ORIGIN_LABEL: Record<string, string> = {
  born_on_farm: "Nascido na fazenda",
  purchased: "Comprado",
  transferred_in: "Transferido de outra fazenda",
  unknown: "Desconhecida",
};

type Tab = "historico" | "pesagens" | "dados";

/** Passaporte: histórico, pesos e dados num só lugar (T11). */
export function AnimalPage() {
  const { id } = useParams();
  const { farm, can } = useSession();
  const { version } = useSync();
  const { animal } = useLocalAnimal(id);
  const [params, setParams] = useSearchParams();
  const tab = (params.get("aba") as Tab) ?? "historico";
  const [history, setHistory] = useState<AnimalHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !farm) return;
    setHistoryError(null);
    get<AnimalHistory>(`/v1/farms/${farm.id}/animals/${id}/history`).then(setHistory, (e) =>
      setHistoryError(errorMessage(e)),
    );
  }, [id, farm, version]);

  if (animal === undefined) return <Loading />;
  if (animal === null) return <Empty title="Animal não encontrado nesta fazenda"><Link to="/rebanho">Voltar ao rebanho</Link></Empty>;

  const today = todayInTimezone(farm!.timezone);
  const active = animal.status === "active";

  return (
    <section>
      <p><Link to="/rebanho">‹ Rebanho</Link></p>
      <div className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>
            {CATEGORY_LABEL[animal.category]} {animal.primaryIdentifier ?? ""}
          </h1>
          <div className="hint">
            {animal.breed ?? "Raça não informada"} · {SEX_LABEL[animal.sex]}
            {animal.birthDate
              ? ` · ${ageInMonths(animal.birthDate, today)} meses${animal.birthDateEstimated ? " (data estimada)" : ""}`
              : ""}
          </div>
        </div>
        <span className={`badge ${active ? "badge-ok" : "badge-muted"}`}>{STATUS_LABEL[animal.status]}</span>
      </div>
      {animal.pending ? <Alert kind="warning">Há alterações deste animal salvas no aparelho aguardando envio.</Alert> : null}

      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <div className="kpi"><strong>{animal.groupName ?? "—"}</strong><span>Lote</span></div>
        <div className="kpi"><strong>{animal.pastureName ?? "—"}</strong><span>Pasto</span></div>
        <div className="kpi">
          <strong>{animal.lastWeight ? formatKg(animal.lastWeight.weightKg) : "—"}</strong>
          <span>{animal.lastWeight ? `Peso em ${formatDate(animal.lastWeight.measuredOn)}` : "Sem pesagem"}</span>
        </div>
        <div className="kpi">
          <strong>{history?.adg ? `${history.adg.adgKgPerDay.toLocaleString("pt-BR")} kg/dia` : "—"}</strong>
          <span>{history?.adg ? `GMD em ${history.adg.days} dias` : "GMD: requer 2 pesagens em datas diferentes"}</span>
        </div>
      </div>

      {active && can("events.write") ? (
        <div className="actions" style={{ marginTop: 0, marginBottom: 16 }}>
          <Link className="btn btn-primary" to={`/registrar/pesagem?animal=${animal.id}`}>Registrar pesagem</Link>
          <Link className="btn btn-secondary" to={`/registrar/movimentacao?animal=${animal.id}`}>Movimentar</Link>
        </div>
      ) : null}

      <div className="tabs" role="tablist">
        {(["historico", "pesagens", "dados"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setParams({ aba: t }, { replace: true })}>
            {t === "historico" ? "Histórico" : t === "pesagens" ? "Pesagens" : "Dados"}
          </button>
        ))}
      </div>

      <div className="card" role="tabpanel">
        {tab !== "dados" && historyError ? (
          <Alert kind="info">Histórico completo disponível com conexão. ({historyError})</Alert>
        ) : null}
        {tab === "historico" ? (
          !history ? (historyError ? null : <Loading />) : history.timeline.length === 0 ? (
            <Empty title="Sem registros" />
          ) : (
            <ol className="timeline">
              {history.timeline.map((e) => (
                <li key={e.id}>
                  <div><strong>{e.summary}</strong></div>
                  <div className="when">
                    {formatDate(e.occurredOn)}
                    {e.actorName ? ` · ${e.actorName}` : ""}
                  </div>
                  {typeof e.data.warning === "string" ? <div className="hint">⚠ {e.data.warning}</div> : null}
                </li>
              ))}
            </ol>
          )
        ) : null}
        {tab === "pesagens" ? (
          !history ? (historyError ? null : <Loading />) : history.weights.length === 0 ? (
            <Empty title="Nenhuma pesagem registrada" />
          ) : (
            <table className="data">
              <thead><tr><th>Data</th><th>Peso vivo</th><th>Origem</th></tr></thead>
              <tbody>
                {[...history.weights].reverse().map((w) => (
                  <tr key={w.id}>
                    <td>{formatDate(w.measuredOn)}</td>
                    <td>{formatKg(w.weightKg)}</td>
                    <td>{w.source === "scale" ? "Balança" : w.source === "import" ? "Importação" : "Digitado"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : null}
        {tab === "dados" ? (
          <div className="review">
            <dl>
              <dt>Situação</dt><dd>{STATUS_LABEL[animal.status]}</dd>
              <dt>Nascimento</dt><dd>{formatDate(animal.birthDate)}{animal.birthDateEstimated ? " (estimada)" : ""}</dd>
              <dt>Origem</dt><dd>{ORIGIN_LABEL[animal.origin]}</dd>
              <dt>Entrada</dt><dd>{formatDate(animal.entryDate)}</dd>
              <dt>Mãe</dt><dd>{animal.damId ? <Link to={`/rebanho/${animal.damId}`}>Ver mãe</Link> : "Não informada"}</dd>
              <dt>Pai</dt><dd>{animal.sireId ? <Link to={`/rebanho/${animal.sireId}`}>Ver pai</Link> : "Não informado"}</dd>
              <dt>Observações</dt><dd>{animal.notes ?? "—"}</dd>
            </dl>
            <h3 style={{ marginTop: 24 }}>Identificadores</h3>
            <ul className="list">
              {animal.identifiers.map((i) => (
                <li key={i.id} className="list-item">
                  <span>
                    <span className="title">{i.display}</span>
                    <div className="meta">{IDENTIFIER_LABEL[i.type]}</div>
                  </span>
                  <span className={`badge ${i.status === "active" ? "badge-ok" : "badge-muted"}`}>
                    {i.status === "active" ? "Ativo" : `Substituído em ${formatDate(i.retiredAt?.slice(0, 10))}`}
                  </span>
                </li>
              ))}
            </ul>
            {active && can("animals.write") ? <RetagPanel animalId={animal.id} canReplace={can("animals.retag")} /> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
