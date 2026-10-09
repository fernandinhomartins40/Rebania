import type {
  CalendarEntryDto,
  ExamDto,
  PlanItemInput,
  TreatmentDto,
  WithdrawalDto,
} from "@rebania/contracts";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  EXAM_KIND_LABEL,
  HEALTH_KIND_LABEL,
  HEALTH_KINDS,
  todayInTimezone,
  TREATMENT_STATUS_LABEL,
  withdrawalStatus,
  type Category,
  type HealthKind,
} from "@rebania/domain";
import {
  CalendarClock,
  ChevronRight,
  ClipboardList,
  FlaskConical,
  Package,
  Plus,
  ShieldAlert,
  Stethoscope,
  Syringe,
  Trash2,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { del, errorMessage, patch, post } from "../../api/client.ts";
import { Alert, Empty, Field, formatDate, Loading, PageHead } from "../../components/ui.tsx";
import { useCachedGet } from "../../state/cached.ts";
import { usePlan, useProducts } from "../../state/health.ts";
import { useLocalHerd } from "../../state/local-data.ts";
import { useSession } from "../../state/session.tsx";

type Tab = "calendario" | "carencias" | "tratamentos" | "exames" | "plano";
const TABS: { key: Tab; label: string }[] = [
  { key: "calendario", label: "Calendário" },
  { key: "carencias", label: "Carências" },
  { key: "tratamentos", label: "Tratamentos" },
  { key: "exames", label: "Exames" },
  { key: "plano", label: "Plano" },
];

/** T23/T25/T26/T28: calendário sanitário, carências, tratamentos, exames e plano. */
export function HealthPage() {
  const { can } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("aba") as Tab) ?? "calendario";
  return (
    <section>
      <PageHead
        title="Sanidade"
        aside={
          can("events.write") ? (
            <Link className="btn btn-soft" to="/registrar/aplicacao">
              <Syringe size={20} aria-hidden="true" /> Aplicar
            </Link>
          ) : null
        }
      />
      <div className="actions" style={{ marginTop: 0 }}>
        <Link className="btn btn-secondary" to="/curral">
          <ClipboardList size={20} aria-hidden="true" /> Modo Curral
        </Link>
        <Link className="btn btn-ghost" to="/fazenda/estoque">
          <Package size={20} aria-hidden="true" /> Estoque
        </Link>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams({ aba: t.key }, { replace: true })}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "calendario" ? <CalendarTab /> : null}
        {tab === "carencias" ? <WithdrawalTab /> : null}
        {tab === "tratamentos" ? <TreatmentsTab /> : null}
        {tab === "exames" ? <ExamsTab /> : null}
        {tab === "plano" ? <PlanTab /> : null}
      </div>
    </section>
  );
}

const STATUS_BADGE: Record<CalendarEntryDto["status"], [string, string]> = {
  overdue: ["badge-danger", "Atrasado"],
  due_soon: ["badge-warn", "Próximo"],
  scheduled: ["badge-info", "Previsto"],
};

function CalendarTab() {
  const { farm, can } = useSession();
  const [days, setDays] = useState(60);
  const { data, offline } = useCachedGet<{ items: CalendarEntryDto[] }>(
    `/v1/farms/${farm!.id}/health/calendar?days=${days}`,
    `calendar:${farm!.id}:${days}`,
  );
  const { plan } = usePlan(farm!.id);
  if (!data || !plan) return <Loading />;
  if (!plan.length)
    return (
      <Empty title="Nenhum plano sanitário configurado" icon={<CalendarClock size={40} />}>
        <p className="hint">
          O calendário segue o plano técnico da sua fazenda (produto, categorias e intervalo). O
          Rebania não traz protocolos prontos.
        </p>
        {can("health.manage") ? (
          <Link className="btn btn-primary" to="/sanidade?aba=plano">
            Configurar plano
          </Link>
        ) : null}
      </Empty>
    );
  return (
    <>
      {offline ? <Alert kind="info">Sem conexão: calendário da última consulta.</Alert> : null}
      <div className="field" style={{ maxWidth: 240 }}>
        <label htmlFor="cal-days">Próximos</label>
        <select id="cal-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[30, 60, 90, 180].map((n) => (
            <option key={n} value={n}>
              {n} dias
            </option>
          ))}
        </select>
      </div>
      {data.items.length === 0 ? (
        <Empty title="Nada previsto no período" />
      ) : (
        <ul className="list">
          {data.items.map((e) => {
            const [cls, label] = STATUS_BADGE[e.status];
            return (
              <li key={`${e.planItemId}:${e.status}:${e.dueOn}`} className="list-item">
                <span>
                  <span className="title">
                    {e.planItemName} <span className={`badge ${cls}`}>{label}</span>
                  </span>
                  <div className="meta">
                    {e.status === "overdue" ? "Desde" : "Em"} {formatDate(e.dueOn)} ·{" "}
                    {e.animalIds.length} animal(is) · {e.reason}
                  </div>
                </span>
                {can("events.write") ? (
                  <Link
                    className="btn btn-soft"
                    to={`/registrar/aplicacao?animais=${e.animalIds.join(",")}&plano=${e.planItemId}&tipo=${e.kind}`}
                  >
                    Aplicar
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function WithdrawalTab() {
  const { farm } = useSession();
  const today = todayInTimezone(farm!.timezone);
  const { data, offline } = useCachedGet<{ items: WithdrawalDto[] }>(
    `/v1/farms/${farm!.id}/withdrawals`,
    `withdrawals:${farm!.id}`,
  );
  if (!data) return <Loading />;
  return (
    <>
      {offline ? <Alert kind="info">Sem conexão: lista da última consulta.</Alert> : null}
      <p className="hint">
        Animais em carência pelos prazos configurados nos produtos. A venda verifica esta lista;
        exceção exige política e responsável — o assistente não libera sozinho.
      </p>
      {data.items.length === 0 ? (
        <Empty title="Nenhum animal em carência" icon={<ShieldAlert size={40} />} />
      ) : (
        <ul className="list">
          {data.items.map((w) => {
            const meat = withdrawalStatus(w.meatUntil, today);
            const milk = withdrawalStatus(w.milkUntil, today);
            return (
              <li key={w.animalId}>
                <Link className="list-item" to={`/rebanho/${w.animalId}`}>
                  <span>
                    <span className="title">{w.animalTag ?? "Sem identificação"}</span>
                    <div className="meta">
                      {meat.inWithdrawal
                        ? `Carne até ${formatDate(meat.until)} (${meat.daysLeft} dia(s))`
                        : null}
                      {meat.inWithdrawal && milk.inWithdrawal ? " · " : null}
                      {milk.inWithdrawal ? `Leite até ${formatDate(milk.until)}` : null}
                    </div>
                    <div className="meta">
                      {w.sources
                        .map((s) => `${s.productName} em ${formatDate(s.appliedOn)}`)
                        .join("; ")}
                    </div>
                  </span>
                  <ChevronRight size={20} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function TreatmentsTab() {
  const { farm, can } = useSession();
  const { data, reload } = useCachedGet<{ items: TreatmentDto[] }>(
    `/v1/farms/${farm!.id}/treatments`,
    `treatments:${farm!.id}`,
  );
  const [closing, setClosing] = useState<string | null>(null);
  const [outcome, setOutcome] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!data) return <Loading />;
  const open = data.items.filter((t) => t.status === "open");
  const closed = data.items.filter((t) => t.status !== "open");
  const close = async (id: string, status: "resolved" | "failed") => {
    setError(null);
    try {
      await patch(`/v1/farms/${farm!.id}/treatments/${id}`, {
        status,
        ...(outcome.trim() ? { outcome: outcome.trim() } : {}),
      });
      setClosing(null);
      setOutcome("");
      reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <>
      {can("events.write") ? (
        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="btn btn-primary" to="/registrar/tratamento">
            <Stethoscope size={20} aria-hidden="true" /> Iniciar tratamento
          </Link>
        </div>
      ) : null}
      {error ? <Alert kind="danger">{error}</Alert> : null}
      {data.items.length === 0 ? (
        <Empty title="Nenhum tratamento registrado" />
      ) : (
        <>
          <h2 style={{ fontSize: 18 }}>Em andamento ({open.length})</h2>
          <ul className="list">
            {open.map((t) => (
              <li key={t.id} className="list-item" style={{ display: "block" }}>
                <span className="title">
                  <Link to={`/rebanho/${t.animalId}`}>{t.animalTag ?? "Animal"}</Link> ·{" "}
                  {t.condition}
                </span>
                <div className="meta">
                  Desde {formatDate(t.startedOn)}
                  {t.responsible ? ` · ${t.responsible}` : ""} · {t.applications.length}{" "}
                  aplicação(ões)
                </div>
                {t.plan ? <div className="meta">Plano: {t.plan}</div> : null}
                {can("events.write") ? (
                  closing === t.id ? (
                    <div style={{ marginTop: 8 }}>
                      <Field id={`out-${t.id}`} label="Resposta / desfecho" hint="opcional">
                        <input
                          id={`out-${t.id}`}
                          value={outcome}
                          onChange={(e) => setOutcome(e.target.value)}
                        />
                      </Field>
                      <div className="actions" style={{ marginTop: 0 }}>
                        <button className="btn btn-primary" onClick={() => close(t.id, "resolved")}>
                          Recuperado
                        </button>
                        <button className="btn btn-secondary" onClick={() => close(t.id, "failed")}>
                          Sem resposta
                        </button>
                        <button className="btn btn-ghost" onClick={() => setClosing(null)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="actions" style={{ marginTop: 8 }}>
                      <Link
                        className="btn btn-soft"
                        to={`/registrar/aplicacao?animais=${t.animalId}&tratamento=${t.id}`}
                      >
                        <Syringe size={18} aria-hidden="true" /> Registrar aplicação
                      </Link>
                      <button className="btn btn-ghost" onClick={() => setClosing(t.id)}>
                        Encerrar
                      </button>
                    </div>
                  )
                ) : null}
              </li>
            ))}
          </ul>
          {closed.length ? (
            <>
              <h2 style={{ fontSize: 18, marginTop: 24 }}>Encerrados</h2>
              <ul className="list">
                {closed.slice(0, 50).map((t) => (
                  <li key={t.id} className="list-item">
                    <span>
                      <span className="title">
                        {t.animalTag ?? "Animal"} · {t.condition}
                      </span>
                      <div className="meta">
                        {formatDate(t.startedOn)} a {formatDate(t.endedOn)} ·{" "}
                        {TREATMENT_STATUS_LABEL[t.status]}
                        {t.outcome ? ` · ${t.outcome}` : ""}
                      </div>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </>
  );
}

function ExamsTab() {
  const { farm, can } = useSession();
  const today = todayInTimezone(farm!.timezone);
  const { data, reload } = useCachedGet<{ items: ExamDto[] }>(
    `/v1/farms/${farm!.id}/exams`,
    `exams:${farm!.id}`,
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [resultOn, setResultOn] = useState(today);
  const [error, setError] = useState<string | null>(null);
  if (!data) return <Loading />;
  const pending = data.items.filter((e) => e.status === "pending");
  const done = data.items.filter((e) => e.status === "done");
  return (
    <>
      {can("events.write") ? (
        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="btn btn-primary" to="/registrar/exame">
            <FlaskConical size={20} aria-hidden="true" /> Registrar coleta
          </Link>
        </div>
      ) : null}
      <p className="hint">
        Foto ou anexo serve como evidência; o resultado é o informado pelo laboratório ou
        responsável, não um diagnóstico automático.
      </p>
      {error ? <Alert kind="danger">{error}</Alert> : null}
      {data.items.length === 0 ? (
        <Empty title="Nenhum exame registrado" />
      ) : (
        <>
          <h2 style={{ fontSize: 18 }}>Aguardando resultado ({pending.length})</h2>
          <ul className="list">
            {pending.map((e) => (
              <li key={e.id} className="list-item" style={{ display: "block" }}>
                <span className="title">
                  {e.animalTag ?? "Animal"} · {EXAM_KIND_LABEL[e.kind]}
                </span>
                <div className="meta">Coletado em {formatDate(e.collectedOn)}</div>
                {can("events.write") ? (
                  editing === e.id ? (
                    <form
                      style={{ marginTop: 8 }}
                      onSubmit={async (ev: FormEvent) => {
                        ev.preventDefault();
                        setError(null);
                        try {
                          await post(`/v1/farms/${farm!.id}/exams/${e.id}/result`, {
                            result: result.trim(),
                            resultOn,
                          });
                          setEditing(null);
                          setResult("");
                          reload();
                        } catch (err) {
                          setError(errorMessage(err));
                        }
                      }}
                    >
                      <div className="grid two" style={{ gap: 12 }}>
                        <Field id={`r-${e.id}`} label="Resultado">
                          <input
                            id={`r-${e.id}`}
                            required
                            value={result}
                            onChange={(ev) => setResult(ev.target.value)}
                          />
                        </Field>
                        <Field id={`ro-${e.id}`} label="Data do resultado">
                          <input
                            id={`ro-${e.id}`}
                            type="date"
                            max={today}
                            value={resultOn}
                            onChange={(ev) => setResultOn(ev.target.value)}
                          />
                        </Field>
                      </div>
                      <div className="actions" style={{ marginTop: 0 }}>
                        <button className="btn btn-primary">Salvar resultado</button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => setEditing(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      className="btn btn-soft"
                      style={{ marginTop: 8 }}
                      onClick={() => setEditing(e.id)}
                    >
                      Informar resultado
                    </button>
                  )
                ) : null}
              </li>
            ))}
          </ul>
          {done.length ? (
            <>
              <h2 style={{ fontSize: 18, marginTop: 24 }}>Com resultado</h2>
              <ul className="list">
                {done.slice(0, 100).map((e) => (
                  <li key={e.id} className="list-item">
                    <span>
                      <span className="title">
                        {e.animalTag ?? "Animal"} · {EXAM_KIND_LABEL[e.kind]}: {e.result}
                      </span>
                      <div className="meta">
                        Coleta {formatDate(e.collectedOn)} · resultado {formatDate(e.resultOn)}
                      </div>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </>
  );
}

function PlanTab() {
  const { farm, can } = useSession();
  const { plan, reload } = usePlan(farm!.id);
  const { products } = useProducts(farm!.id);
  const { animals } = useLocalHerd(farm!.id);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({
    name: "",
    kind: "vaccination" as HealthKind,
    productId: "",
    categories: [] as Category[],
    everyDays: "",
    firstAtAgeDays: "",
    source: "",
  });
  const [error, setError] = useState<string | null>(null);
  if (!plan || !products) return <Loading />;
  const manage = can("health.manage");
  const count = (cats: Category[]) =>
    (animals ?? []).filter((a) => a.status === "active" && cats.includes(a.category)).length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const body: PlanItemInput = {
      name: f.name.trim(),
      kind: f.kind,
      productId: f.productId || null,
      categories: f.categories,
      everyDays: f.everyDays ? Number(f.everyDays) : null,
      firstAtAgeDays: f.firstAtAgeDays ? Number(f.firstAtAgeDays) : null,
      source: f.source.trim(),
    };
    try {
      await post(`/v1/farms/${farm!.id}/health/plan`, body);
      setAdding(false);
      setF({ ...f, name: "", categories: [], everyDays: "", firstAtAgeDays: "", source: "" });
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <p className="hint">
        Itens do plano técnico da fazenda. Cada item informa a origem (responsável técnico); o
        calendário calcula quem está previsto e atrasado a partir das aplicações registradas.
      </p>
      {plan.length === 0 && !adding ? <Empty title="Nenhum item no plano" /> : null}
      <ul className="list">
        {plan.map((p) => (
          <li key={p.id} className="list-item">
            <span>
              <span className="title">{p.name}</span>
              <div className="meta">
                {HEALTH_KIND_LABEL[p.kind]}
                {p.productName ? ` · ${p.productName}` : ""} ·{" "}
                {p.categories.map((c) => CATEGORY_LABEL[c]).join(", ")} ({count(p.categories)}{" "}
                animais)
              </div>
              <div className="meta">
                {p.everyDays ? `A cada ${p.everyDays} dias` : "Dose única"}
                {p.firstAtAgeDays !== null ? ` · 1ª aos ${p.firstAtAgeDays} dias de idade` : ""} ·
                Fonte: {p.source}
              </div>
            </span>
            {manage ? (
              <button
                className="icon-btn"
                aria-label={`Remover ${p.name}`}
                onClick={async () => {
                  await del(`/v1/farms/${farm!.id}/health/plan/${p.id}`);
                  reload();
                }}
              >
                <Trash2 size={20} />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {manage && !adding ? (
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={20} aria-hidden="true" /> Adicionar item
        </button>
      ) : null}
      {adding ? (
        <form className="card" onSubmit={submit} style={{ marginTop: 12 }}>
          {error ? <Alert kind="danger">{error}</Alert> : null}
          <Field id="pl-name" label="Nome">
            <input
              id="pl-name"
              required
              minLength={2}
              placeholder="Ex.: Vacinação de matrizes"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </Field>
          <div className="grid two" style={{ gap: 12 }}>
            <Field id="pl-kind" label="Tipo">
              <select
                id="pl-kind"
                value={f.kind}
                onChange={(e) => setF({ ...f, kind: e.target.value as HealthKind })}
              >
                {HEALTH_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {HEALTH_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="pl-prod" label="Produto" hint="opcional">
              <select
                id="pl-prod"
                value={f.productId}
                onChange={(e) => setF({ ...f, productId: e.target.value })}
              >
                <option value="">Qualquer / não vinculado</option>
                {products
                  .filter((p) => p.kind !== "semen" && p.kind !== "feed")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <fieldset className="field" style={{ border: 0, padding: 0 }}>
            <legend style={{ fontWeight: 700, marginBottom: 6 }}>Categorias</legend>
            <div className="seg">
              {CATEGORIES.map((c) => (
                <label key={c}>
                  <input
                    type="checkbox"
                    checked={f.categories.includes(c)}
                    onChange={(e) =>
                      setF({
                        ...f,
                        categories: e.target.checked
                          ? [...f.categories, c]
                          : f.categories.filter((x) => x !== c),
                      })
                    }
                  />{" "}
                  {CATEGORY_LABEL[c]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid two" style={{ gap: 12 }}>
            <Field id="pl-every" label="Repetir a cada (dias)" hint="vazio = dose única">
              <input
                id="pl-every"
                inputMode="numeric"
                value={f.everyDays}
                onChange={(e) => setF({ ...f, everyDays: e.target.value.replace(/\D/g, "") })}
              />
            </Field>
            <Field id="pl-age" label="1ª dose com idade (dias)" hint="opcional">
              <input
                id="pl-age"
                inputMode="numeric"
                value={f.firstAtAgeDays}
                onChange={(e) => setF({ ...f, firstAtAgeDays: e.target.value.replace(/\D/g, "") })}
              />
            </Field>
          </div>
          <Field id="pl-src" label="Responsável técnico / origem">
            <input
              id="pl-src"
              required
              minLength={3}
              placeholder="Ex.: Plano do Dr. Carlos (CRMV-GO 0000)"
              value={f.source}
              onChange={(e) => setF({ ...f, source: e.target.value })}
            />
          </Field>
          <div className="actions">
            <button className="btn btn-primary" disabled={!f.categories.length}>
              Salvar item
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </>
  );
}
