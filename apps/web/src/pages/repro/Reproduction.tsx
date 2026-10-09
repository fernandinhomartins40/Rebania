import type { ExpectedCalvingDto } from "@rebania/contracts";
import { CalendarDays, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { errorMessage, get, post } from "../../api/client.ts";
import { GroupPicker } from "../../components/GroupPicker.tsx";
import { Alert, Empty, Field, Loading, PageHead, formatDate } from "../../components/ui.tsx";
import type { LocalAnimal } from "../../offline/engine.ts";
import { useLocalHerd } from "../../state/local-data.ts";
import { useSession } from "../../state/session.tsx";

type Tab = "partos" | "estacoes" | "protocolos";

/** Reprodução: visões do mesmo rebanho (não cria cadastro paralelo). */
export function ReproductionPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("aba") as Tab) ?? "partos";
  return (
    <section>
      <PageHead title="Reprodução" />
      <div className="tabs" role="tablist">
        {(["partos", "estacoes", "protocolos"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setParams({ aba: t }, { replace: true })}
          >
            {t === "partos"
              ? "Partos previstos"
              : t === "estacoes"
                ? "Estações de monta"
                : "Protocolos IATF"}
          </button>
        ))}
      </div>
      {tab === "partos" ? <ExpectedCalvings /> : tab === "estacoes" ? <Seasons /> : <Protocols />}
    </section>
  );
}

function ExpectedCalvings() {
  const { farm } = useSession();
  const [items, setItems] = useState<ExpectedCalvingDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(60);
  useEffect(() => {
    get<ExpectedCalvingDto[]>(
      `/v1/farms/${farm!.id}/reproduction/expected-calvings?days=${days}`,
    ).then(setItems, (e) => setError(errorMessage(e)));
  }, [farm, days]);
  if (error) return <Alert kind="info">Partos previstos disponíveis com conexão. ({error})</Alert>;
  if (!items) return <Loading />;
  return (
    <div>
      <div className="field" style={{ maxWidth: 260 }}>
        <label htmlFor="pp-days">Próximos</label>
        <select id="pp-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[30, 60, 90, 180, 365].map((n) => (
            <option key={n} value={n}>
              {n} dias
            </option>
          ))}
        </select>
      </div>
      {items.length === 0 ? (
        <Empty title="Nenhum parto previsto no período">
          <p className="hint">
            A previsão só aparece para fêmeas prenhas com cobertura ou idade gestacional registrada.
            Sem dados, a estimativa fica indisponível.
          </p>
        </Empty>
      ) : (
        <div className="animal-list">
          {items.map((c) => (
            <Link key={c.animalId} className="animal-card" to={`/rebanho/${c.animalId}`}>
              <div className="body">
                <span className="name">
                  Matriz {c.tag ?? "—"}{" "}
                  {c.overdue ? <span className="badge badge-danger">janela vencida</span> : null}
                </span>
                <span className="meta">
                  Previsto {formatDate(c.date)} (entre {formatDate(c.windowStart)} e{" "}
                  {formatDate(c.windowEnd)}) · {c.groupName ?? "Sem lote"}
                </span>
                <span className="meta">Origem: {c.source}</span>
              </div>
              <span className="chev">
                <ChevronRight size={22} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      )}
      <div className="actions">
        <Link to="/registrar/nascimento" className="btn btn-primary">
          Registrar nascimento
        </Link>
      </div>
    </div>
  );
}

interface Season {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}
interface SeasonReport {
  exposed: number;
  diagnosed: number;
  pregnant: number;
  open: number;
  inconclusive: number;
  notDiagnosed: number;
  rateAmongDiagnosed: number | null;
  coverage: number | null;
  formula: string;
  breedingsByKind: Record<string, number>;
}
const pct = (v: number | null) =>
  v === null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function Seasons() {
  const { farm, can } = useSession();
  const [list, setList] = useState<Season[] | null>(null);
  const [report, setReport] = useState<{ id: string; data: SeasonReport } | null>(null);
  const [form, setForm] = useState({ name: "", startDate: "", endDate: "" });
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      get<Season[]>(`/v1/farms/${farm!.id}/breeding-seasons`).then(setList, (e) =>
        setError(errorMessage(e)),
      ),
    [farm],
  );
  useEffect(() => void load(), [load]);
  return (
    <div>
      {error ? <Alert kind="danger">{error}</Alert> : null}
      {!list ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty title="Nenhuma estação cadastrada" />
      ) : (
        <div className="animal-list">
          {list.map((s) => (
            <div key={s.id} className="card" style={{ marginBottom: 0 }}>
              <div className="section-head">
                <h2 style={{ margin: 0 }}>{s.name}</h2>
                <button
                  className="btn btn-soft"
                  onClick={async () =>
                    setReport({
                      id: s.id,
                      data: await get<SeasonReport>(
                        `/v1/farms/${farm!.id}/breeding-seasons/${s.id}/report`,
                      ),
                    })
                  }
                >
                  Ver resultado
                </button>
              </div>
              <p className="hint">
                {formatDate(s.startDate)} a {formatDate(s.endDate)}
              </p>
              {report?.id === s.id ? (
                <div>
                  <div className="tiles" style={{ marginBottom: 12 }}>
                    <div className="tile tile-sage">
                      <div>
                        <strong>{pct(report.data.rateAmongDiagnosed)}</strong>
                        <span>taxa de prenhez</span>
                      </div>
                    </div>
                    <div className="tile tile-cream">
                      <div>
                        <strong>{pct(report.data.coverage)}</strong>
                        <span>cobertura de diagnóstico</span>
                      </div>
                    </div>
                  </div>
                  <div className="review">
                    <dl>
                      <dt>Expostas</dt>
                      <dd>{report.data.exposed}</dd>
                      <dt>Prenhas</dt>
                      <dd>{report.data.pregnant}</dd>
                      <dt>Vazias</dt>
                      <dd>{report.data.open}</dd>
                      <dt>Inconclusivas</dt>
                      <dd>{report.data.inconclusive}</dd>
                      <dt>Sem diagnóstico</dt>
                      <dd>{report.data.notDiagnosed}</dd>
                    </dl>
                  </div>
                  <p className="hint" style={{ marginTop: 12 }}>
                    {report.data.formula}
                  </p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {can("groups.manage") ? (
        <form
          className="card"
          style={{ marginTop: 16 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await post(`/v1/farms/${farm!.id}/breeding-seasons`, form);
              setForm({ name: "", startDate: "", endDate: "" });
              await load();
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <h2>Nova estação</h2>
          <Field id="s-name" label="Nome">
            <input
              id="s-name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="grid two">
            <Field id="s-start" label="Início" icon={<CalendarDays size={22} aria-hidden="true" />}>
              <input
                id="s-start"
                type="date"
                required
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </Field>
            <Field id="s-end" label="Fim" icon={<CalendarDays size={22} aria-hidden="true" />}>
              <input
                id="s-end"
                type="date"
                required
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </Field>
          </div>
          <button className="btn btn-primary">Criar estação</button>
        </form>
      ) : null}
    </div>
  );
}

interface Protocol {
  id: string;
  version: number;
  name: string;
  steps: { day: number; title: string; description?: string; inseminate?: boolean }[];
  responsible: string | null;
}

function Protocols() {
  const { farm, can } = useSession();
  const { animals, places } = useLocalHerd(farm!.id);
  const [list, setList] = useState<Protocol[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    name: string;
    responsible: string;
    steps: { day: string; title: string; inseminate: boolean }[];
  }>({ name: "", responsible: "", steps: [{ day: "0", title: "", inseminate: false }] });
  const [exec, setExec] = useState<{ protocolId: string; startDate: string; ids: string[] } | null>(
    null,
  );
  const load = useCallback(
    () =>
      get<Protocol[]>(`/v1/farms/${farm!.id}/protocols`).then(setList, (e) =>
        setError(errorMessage(e)),
      ),
    [farm],
  );
  useEffect(() => void load(), [load]);
  const eligible = useCallback(
    (a: LocalAnimal) =>
      a.sex === "female" &&
      (a.category === "heifer" || a.category === "cow") &&
      a.repro?.status !== "pregnant",
    [],
  );

  return (
    <div>
      <Alert kind="info">
        Os protocolos são definidos pela fazenda e pelo veterinário responsável. O Rebania organiza
        etapas e agenda; não sugere medicamentos nem doses.
      </Alert>
      {error ? <Alert kind="danger">{error}</Alert> : null}
      {info ? <Alert kind="success">{info}</Alert> : null}
      {!list ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty title="Nenhum protocolo cadastrado" />
      ) : (
        list.map((p) => (
          <div key={p.id} className="card">
            <div className="section-head">
              <h2 style={{ margin: 0 }}>
                {p.name} <span className="badge badge-muted">v{p.version}</span>
              </h2>
              {can("events.write") ? (
                <button
                  className="btn btn-soft"
                  onClick={() => setExec({ protocolId: p.id, startDate: "", ids: [] })}
                >
                  Iniciar execução
                </button>
              ) : null}
            </div>
            <ol className="hint">
              {p.steps.map((s, i) => (
                <li key={i}>
                  D{s.day}: {s.title}
                  {s.inseminate ? " (inseminação)" : ""}
                </li>
              ))}
            </ol>
            {exec?.protocolId === p.id && animals ? (
              <div>
                <Field
                  id="ex-start"
                  label="Data do D0"
                  icon={<CalendarDays size={22} aria-hidden="true" />}
                >
                  <input
                    id="ex-start"
                    type="date"
                    value={exec.startDate}
                    onChange={(e) => setExec({ ...exec, startDate: e.target.value })}
                  />
                </Field>
                <GroupPicker
                  animals={animals}
                  places={places}
                  eligible={eligible}
                  selected={exec.ids}
                  onChange={(ids) => setExec({ ...exec, ids })}
                />
                <div className="actions">
                  <button
                    className="btn btn-primary"
                    disabled={!exec.startDate || !exec.ids.length}
                    onClick={async () => {
                      try {
                        const r = await post<{ steps: number; animals: number }>(
                          `/v1/farms/${farm!.id}/protocol-executions`,
                          { protocolId: p.id, startDate: exec.startDate, animalIds: exec.ids },
                        );
                        setInfo(
                          `Execução criada: ${r.steps} etapa(s) agendada(s) para ${r.animals} animal(is). Veja na Agenda.`,
                        );
                        setExec(null);
                      } catch (e) {
                        setError(errorMessage(e));
                      }
                    }}
                  >
                    Agendar {exec.ids.length} animal(is)
                  </button>
                  <button className="btn btn-ghost" onClick={() => setExec(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))
      )}
      {can("settings.manage") ? (
        <form
          className="card"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await post(`/v1/farms/${farm!.id}/protocols`, {
                name: draft.name,
                ...(draft.responsible ? { responsible: draft.responsible } : {}),
                steps: draft.steps.map((s) => ({
                  day: Number(s.day),
                  title: s.title,
                  inseminate: s.inseminate,
                })),
              });
              setDraft({
                name: "",
                responsible: "",
                steps: [{ day: "0", title: "", inseminate: false }],
              });
              await load();
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <h2>Novo protocolo</h2>
          <div className="grid two">
            <Field id="pr-name" label="Nome">
              <input
                id="pr-name"
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field id="pr-resp" label="Responsável técnico" hint="opcional">
              <input
                id="pr-resp"
                value={draft.responsible}
                onChange={(e) => setDraft({ ...draft, responsible: e.target.value })}
              />
            </Field>
          </div>
          {draft.steps.map((s, i) => (
            <div key={i} className="searchbar" style={{ alignItems: "center" }}>
              <input
                aria-label={`Dia da etapa ${i + 1}`}
                style={{ maxWidth: 90 }}
                inputMode="numeric"
                value={s.day}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    steps: draft.steps.map((x, j) =>
                      j === i ? { ...x, day: e.target.value.replace(/\D/g, "") } : x,
                    ),
                  })
                }
              />
              <input
                aria-label={`Etapa ${i + 1}`}
                placeholder="Descrição da etapa"
                value={s.title}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    steps: draft.steps.map((x, j) =>
                      j === i ? { ...x, title: e.target.value } : x,
                    ),
                  })
                }
              />
              <label className="check" style={{ margin: 0, whiteSpace: "nowrap" }}>
                <input
                  type="checkbox"
                  checked={s.inseminate}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      steps: draft.steps.map((x, j) =>
                        j === i ? { ...x, inseminate: e.target.checked } : x,
                      ),
                    })
                  }
                />{" "}
                Inseminação artificial
              </label>
              <button
                type="button"
                className="icon-btn"
                aria-label="Remover etapa"
                onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })}
                disabled={draft.steps.length === 1}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
          <div className="actions">
            <button
              type="button"
              className="btn btn-soft"
              onClick={() =>
                setDraft({
                  ...draft,
                  steps: [...draft.steps, { day: "", title: "", inseminate: false }],
                })
              }
            >
              <Plus size={18} /> Etapa
            </button>
            <button
              className="btn btn-primary"
              disabled={!draft.name || draft.steps.some((s) => s.day === "" || !s.title)}
            >
              Salvar protocolo
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
