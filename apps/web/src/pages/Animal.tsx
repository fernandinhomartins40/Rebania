import {
  ArrowLeftRight,
  CalendarDays,
  ChartColumn,
  ChevronRight,
  MapPin,
  Pencil,
  Tag,
  Weight,
} from "lucide-react";
import { BrandCow, type IconComponent } from "../components/brand.tsx";
import type { AnimalHistory } from "@rebania/contracts";
import {
  ageInMonths,
  CATEGORY_LABEL,
  IDENTIFIER_LABEL,
  SEX_LABEL,
  STATUS_LABEL,
  todayInTimezone,
} from "@rebania/domain";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { errorMessage, get } from "../api/client.ts";
import {
  ageLabel,
  Alert,
  Empty,
  formatDate,
  formatKg,
  Loading,
  PageHead,
} from "../components/ui.tsx";
import { useLocalAnimal } from "../state/local-data.ts";
import { useSession } from "../state/session.tsx";
import { useSync } from "../state/sync.tsx";
import { PhotoGallery } from "../components/PhotoGallery.tsx";
import { RetagPanel } from "./Retag.tsx";

const ORIGIN_LABEL: Record<string, string> = {
  born_on_farm: "Nascido na fazenda",
  purchased: "Comprado",
  transferred_in: "Transferido de outra fazenda",
  unknown: "Desconhecida",
};

const EVENT_ICON: Record<string, IconComponent> = {
  registered: BrandCow,
  weighed: Weight,
  moved: ArrowLeftRight,
  identifier_added: Tag,
  retagged: Tag,
  updated: Pencil,
};

const EVENT_TITLE: Record<string, string> = {
  registered: "Cadastro",
  weighed: "Pesagem",
  moved: "Movimentação",
  identifier_added: "Identificador adicionado",
  retagged: "Troca de identificação",
  updated: "Dados atualizados",
};

type Tab = "historico" | "fotos" | "dados";

/** Passaporte do animal (T11): foto, métricas, histórico, fotos e dados. */
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
  if (animal === null) {
    return (
      <Empty title="Animal não encontrado nesta fazenda">
        <Link to="/rebanho">Voltar ao rebanho</Link>
      </Empty>
    );
  }

  const today = todayInTimezone(farm!.timezone);
  const active = animal.status === "active";
  const detail = (summary: string) => summary.replace(/^[^:]+:\s*/, "");

  return (
    <section>
      <PageHead
        title={`${CATEGORY_LABEL[animal.category]} ${animal.primaryIdentifier ?? ""}`}
        back="/rebanho"
      />

      <div
        className="hero-photo"
        aria-label={animal.photo ? "Foto do animal" : "Foto do animal (ainda não enviada)"}
      >
        {animal.photo ? (
          <img src={animal.photo.displayUrl} alt="" />
        ) : (
          <BrandCow size={96} aria-hidden="true" />
        )}
        <span className={`badge pill ${active ? "badge-ok" : "badge-muted"}`}>
          {animal.pending ? "Salvo no aparelho" : STATUS_LABEL[animal.status]}
        </span>
        {animal.photo ? null : <span className="note">Sem foto</span>}
      </div>

      <div className="stats">
        <div className="stat">
          <MapPin size={26} aria-hidden="true" />
          <div>
            <strong>{animal.groupName ?? "—"}</strong>
            <span>Lote</span>
          </div>
        </div>
        <div className="stat">
          <Weight size={26} aria-hidden="true" />
          <div>
            <strong>{animal.lastWeight ? formatKg(animal.lastWeight.weightKg) : "—"}</strong>
            <span>Peso atual</span>
          </div>
        </div>
        <div className="stat">
          {history?.adg ? (
            <ChartColumn size={26} aria-hidden="true" />
          ) : (
            <CalendarDays size={26} aria-hidden="true" />
          )}
          <div>
            {history?.adg ? (
              <>
                <strong>{history.adg.adgKgPerDay.toLocaleString("pt-BR")} kg/dia</strong>
                <span>GMD ({history.adg.days} dias)</span>
              </>
            ) : (
              <>
                <strong>
                  {animal.birthDate ? ageLabel(ageInMonths(animal.birthDate, today)) : "—"}
                </strong>
                <span>Idade</span>
              </>
            )}
          </div>
        </div>
      </div>

      {active && can("events.write") ? (
        <div className="actions" style={{ marginTop: 0, marginBottom: 16 }}>
          <Link className="btn btn-primary" to={`/registrar/pesagem?animal=${animal.id}`}>
            <Weight size={20} /> Registrar pesagem
          </Link>
          <Link className="btn btn-secondary" to={`/registrar/movimentacao?animal=${animal.id}`}>
            <ArrowLeftRight size={20} /> Movimentar
          </Link>
        </div>
      ) : null}
      {animal.pending ? (
        <Alert kind="warning">
          Há alterações deste animal salvas no aparelho aguardando envio.
        </Alert>
      ) : null}

      <div className="tabs" role="tablist">
        {(["historico", "fotos", "dados"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setParams({ aba: t }, { replace: true })}
          >
            {t === "historico" ? "Histórico" : t === "fotos" ? "Fotos" : "Dados"}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "historico" ? (
          historyError ? (
            <Alert kind="info">Histórico completo disponível com conexão.</Alert>
          ) : !history ? (
            <Loading />
          ) : history.timeline.length === 0 ? (
            <Empty title="Sem registros" />
          ) : (
            <ol className="timeline">
              {history.timeline.map((e) => {
                const Ic = EVENT_ICON[e.type] ?? CalendarDays;
                return (
                  <li key={e.id}>
                    <span className="node" aria-hidden="true" />
                    <span className="ic" aria-hidden="true">
                      <Ic size={24} />
                    </span>
                    <div className="txt">
                      <strong>{EVENT_TITLE[e.type] ?? e.summary}</strong>
                      <span>
                        {formatDate(e.occurredOn)} · {detail(e.summary)}
                        {e.actorName ? ` · ${e.actorName}` : ""}
                      </span>
                      {typeof e.data.warning === "string" ? (
                        <span style={{ color: "var(--color-warning)" }}>{e.data.warning}</span>
                      ) : null}
                    </div>
                    <ChevronRight size={20} aria-hidden="true" />
                  </li>
                );
              })}
            </ol>
          )
        ) : null}

        {tab === "fotos" ? <PhotoGallery animalId={animal.id} /> : null}

        {tab === "dados" ? (
          <div className="card review">
            <dl>
              <dt>Situação</dt>
              <dd>{STATUS_LABEL[animal.status]}</dd>
              <dt>Sexo</dt>
              <dd>{SEX_LABEL[animal.sex]}</dd>
              <dt>Raça</dt>
              <dd>{animal.breed ?? "Não informada"}</dd>
              <dt>Nascimento</dt>
              <dd>
                {formatDate(animal.birthDate)}
                {animal.birthDateEstimated ? " (estimada)" : ""}
              </dd>
              <dt>Origem</dt>
              <dd>{ORIGIN_LABEL[animal.origin]}</dd>
              <dt>Entrada</dt>
              <dd>{formatDate(animal.entryDate)}</dd>
              <dt>Pasto</dt>
              <dd>{animal.pastureName ?? "—"}</dd>
              <dt>Mãe</dt>
              <dd>
                {animal.damId ? (
                  <Link to={`/rebanho/${animal.damId}`}>Ver mãe</Link>
                ) : (
                  "Não informada"
                )}
              </dd>
              <dt>Pai</dt>
              <dd>
                {animal.sireId ? (
                  <Link to={`/rebanho/${animal.sireId}`}>Ver pai</Link>
                ) : (
                  "Não informado"
                )}
              </dd>
              <dt>Observações</dt>
              <dd>{animal.notes ?? "—"}</dd>
            </dl>
            {history && history.weights.length ? (
              <>
                <h2 style={{ marginTop: 24 }}>Pesagens</h2>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Peso vivo</th>
                      <th>Origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...history.weights].reverse().map((w) => (
                      <tr key={w.id} style={{ cursor: "default" }}>
                        <td>{formatDate(w.measuredOn)}</td>
                        <td>{formatKg(w.weightKg)}</td>
                        <td>
                          {w.source === "scale"
                            ? "Balança"
                            : w.source === "import"
                              ? "Importação"
                              : "Digitado"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}
            <h2 style={{ marginTop: 24 }}>Identificadores</h2>
            <ul className="list">
              {animal.identifiers.map((i) => (
                <li key={i.id} className="list-item">
                  <span>
                    <span className="title">{i.display}</span>
                    <div className="meta">{IDENTIFIER_LABEL[i.type]}</div>
                  </span>
                  <span className={`badge ${i.status === "active" ? "badge-ok" : "badge-muted"}`}>
                    {i.status === "active"
                      ? "Ativo"
                      : `Substituído em ${formatDate(i.retiredAt?.slice(0, 10))}`}
                  </span>
                </li>
              ))}
            </ul>
            {active && can("animals.write") ? (
              <RetagPanel animalId={animal.id} canReplace={can("animals.retag")} />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
