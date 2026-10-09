import type { HandlingOpenInput } from "@rebania/contracts";
import {
  ADMIN_ROUTE_LABEL,
  daysBetween,
  formatQuantity,
  HEALTH_KIND_LABEL,
  HEALTH_KINDS,
  isCivilDate,
  todayInTimezone,
  type AdminRoute,
  type HealthKind,
} from "@rebania/domain";
import { ArrowRight, CalendarDays, Weight } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { GroupPicker, SelectionSummary } from "../../components/GroupPicker.tsx";
import {
  doseRowsValid,
  ProductDoses,
  toApplicationProducts,
  type DoseRow,
} from "../../components/ProductDoses.tsx";
import { Alert, Field, formatDate, Loading, PageHead, Steps } from "../../components/ui.tsx";
import { saveSession, type LocalSession } from "../../offline/curral.ts";
import { newMutationBase, type LocalAnimal } from "../../offline/engine.ts";
import { useDraft } from "../../state/draft.ts";
import { usePlan, useProducts } from "../../state/health.ts";
import { useLocalHerd } from "../../state/local-data.ts";
import { useSession } from "../../state/session.tsx";
import { useSync } from "../../state/sync.tsx";

interface Draft {
  step: 1 | 2 | 3;
  ids: string[];
  name: string;
  date: string;
  weigh: boolean;
  healthKind: HealthKind;
  rows: DoseRow[];
  applicator: string;
  planItemId: string;
}

/** Configurar a sessão uma vez: snapshot dos animais + manejo (pesagem e/ou produtos). */
export function CurralSetupPage() {
  const { farm, can } = useSession();
  const { engine } = useSync();
  const navigate = useNavigate();
  const { animals, places } = useLocalHerd(farm!.id);
  const { products } = useProducts(farm!.id);
  const { plan } = usePlan(farm!.id);
  const today = todayInTimezone(farm!.timezone);
  const [d, setD, clear] = useDraft<Draft>(`curral-setup:${farm!.id}`, {
    step: 1,
    ids: [],
    name: "",
    date: today,
    weigh: false,
    healthKind: "vaccination",
    rows: [],
    applicator: "",
    planItemId: "",
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const eligible = useCallback((a: LocalAnimal) => a.status === "active", []);

  if (!animals || !products) return <Loading />;
  const dateError = !isCivilDate(d.date)
    ? "Data inválida."
    : daysBetween(today, d.date) > 0
      ? "Data no futuro."
      : null;
  const configOk = (d.weigh || d.rows.length > 0) && (!d.rows.length || doseRowsValid(d.rows));
  const byId = new Map(products.map((p) => [p.id, p]));

  async function start() {
    setBusy(true);
    const id = crypto.randomUUID();
    const name =
      d.name.trim() ||
      [d.rows.length ? HEALTH_KIND_LABEL[d.healthKind] : null, d.weigh ? "Pesagem" : null]
        .filter(Boolean)
        .join(" + ");
    const payload: HandlingOpenInput = {
      name,
      date: d.date,
      animalIds: d.ids,
      config: {
        weigh: d.weigh,
        healthKind: d.healthKind,
        products: toApplicationProducts(d.rows),
        ...(d.applicator.trim() ? { applicator: d.applicator.trim() } : {}),
        ...(d.planItemId ? { planItemId: d.planItemId } : {}),
      },
    };
    const local: LocalSession = {
      id,
      farmId: farm!.id,
      name,
      date: d.date,
      status: "open",
      config: {
        ...payload.config,
        weigh: d.weigh,
        healthKind: d.healthKind,
        products: toApplicationProducts(d.rows).map((p) => ({
          ...p,
          productName: byId.get(p.productId)?.name,
          unit: byId.get(p.productId)?.unit,
        })),
      },
      items: d.ids.map((animalId) => ({
        animalId,
        status: "pending",
        added: false,
        weightKg: null,
        note: null,
        doneAt: null,
      })),
      exceptions: [],
      reads: [],
      currentId: null,
      readerConnected: true,
      createdAt: new Date().toISOString(),
      closedAt: null,
    };
    await saveSession(local);
    await engine.submit({ ...newMutationBase(id), type: "handling.open", payload });
    clear();
    navigate(`/curral/${id}`, { replace: true });
  }

  return (
    <section>
      <PageHead title="Nova sessão de curral" back="/curral" />
      <Steps current={d.step} labels={["Selecionar", "Configurar", "Iniciar"]} />
      {d.step === 1 ? (
        <div className="card">
          <GroupPicker
            animals={animals}
            places={places}
            eligible={eligible}
            selected={d.ids}
            onChange={(ids) => set("ids", ids)}
            hint="A seleção vira a lista da sessão. Animais lidos fora dela podem ser incluídos durante o manejo."
          />
          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              disabled={!d.ids.length}
              onClick={() => set("step", 2)}
            >
              Continuar com {d.ids.length} <ArrowRight size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
      {d.step === 2 ? (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            if (!dateError && configOk) set("step", 3);
          }}
        >
          <Field id="c-name" label="Nome da sessão" hint="opcional">
            <input
              id="c-name"
              placeholder="Ex.: Vacinação lote 3"
              value={d.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field
            id="c-date"
            label="Data do manejo"
            error={dateError}
            icon={<CalendarDays size={22} aria-hidden="true" />}
          >
            <input
              id="c-date"
              type="date"
              max={today}
              value={d.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </Field>
          <label className="check" style={{ margin: "8px 0 16px" }}>
            <input
              type="checkbox"
              checked={d.weigh}
              onChange={(e) => set("weigh", e.target.checked)}
            />
            <span>
              <Weight size={18} aria-hidden="true" /> Pesar cada animal
            </span>
          </label>
          <h2 style={{ fontSize: 18, margin: "8px 0" }}>Aplicação</h2>
          {d.rows.length === 0 ? (
            <button
              type="button"
              className="btn btn-soft"
              onClick={() =>
                set("rows", [
                  { productId: "", batchId: "", dose: "", route: "" as AdminRoute | "" },
                ])
              }
            >
              Aplicar produto nesta sessão
            </button>
          ) : (
            <>
              <div className="field">
                <label>Tipo</label>
                <div className="seg" role="radiogroup" aria-label="Tipo de aplicação">
                  {HEALTH_KINDS.filter((k) => k !== "treatment").map((k) => (
                    <label key={k}>
                      <input
                        type="radio"
                        name="hk"
                        checked={d.healthKind === k}
                        onChange={() => set("healthKind", k)}
                      />{" "}
                      {HEALTH_KIND_LABEL[k]}
                    </label>
                  ))}
                </div>
              </div>
              <ProductDoses
                products={products}
                rows={d.rows}
                onChange={(rows) => set("rows", rows)}
                date={d.date}
                canManageStock={can("stock.manage") || can("health.manage")}
              />
              <button type="button" className="btn btn-ghost" onClick={() => set("rows", [])}>
                Sem aplicação
              </button>
              <div className="grid two" style={{ gap: 12, marginTop: 12 }}>
                <Field id="c-app" label="Aplicador" hint="opcional">
                  <input
                    id="c-app"
                    value={d.applicator}
                    onChange={(e) => set("applicator", e.target.value)}
                  />
                </Field>
                {plan?.length ? (
                  <Field id="c-plan" label="Item do calendário" hint="opcional">
                    <select
                      id="c-plan"
                      value={d.planItemId}
                      onChange={(e) => set("planItemId", e.target.value)}
                    >
                      <option value="">Avulsa</option>
                      {plan.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
              </div>
            </>
          )}
          {!d.weigh && !d.rows.length ? (
            <Alert kind="info">Escolha pesagem, aplicação ou ambas.</Alert>
          ) : null}
          <div className="actions">
            <button className="btn btn-primary btn-lg" disabled={Boolean(dateError) || !configOk}>
              Revisar <ArrowRight size={20} aria-hidden="true" />
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => set("step", 1)}>
              Voltar
            </button>
          </div>
        </form>
      ) : null}
      {d.step === 3 ? (
        <div className="card review">
          <h2>Revise a sessão</h2>
          <dl>
            <dt>Data</dt>
            <dd>{formatDate(d.date)}</dd>
            <dt>Pesagem</dt>
            <dd>{d.weigh ? "Sim, cada animal" : "Não"}</dd>
            {d.rows.map((r, i) => {
              const p = byId.get(r.productId);
              return (
                <div key={i} style={{ display: "contents" }}>
                  <dt>{i === 0 ? HEALTH_KIND_LABEL[d.healthKind] : ""}</dt>
                  <dd>
                    {p?.name} · {formatQuantity(Number(r.dose.replace(",", ".")), p?.unit ?? "")}
                    {r.route ? ` · ${ADMIN_ROUTE_LABEL[r.route]}` : ""}
                  </dd>
                </div>
              );
            })}
          </dl>
          <SelectionSummary animals={animals} ids={d.ids} />
          <Alert kind="info">
            Nada é registrado ao iniciar: cada animal só conta quando você confirmar o que foi feito
            com ele.
          </Alert>
          <div className="actions">
            <button className="btn btn-primary btn-lg" disabled={busy} onClick={start}>
              {busy ? "Abrindo…" : "Iniciar manejo"}
            </button>
            <button className="btn btn-ghost" onClick={() => set("step", 2)}>
              Editar
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
