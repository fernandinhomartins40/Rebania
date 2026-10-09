import type { GroupOperationResult, HealthApplyInput } from "@rebania/contracts";
import {
  ADMIN_ROUTE_LABEL,
  addDays,
  daysBetween,
  formatQuantity,
  HEALTH_KIND_LABEL,
  HEALTH_KINDS,
  isCivilDate,
  todayInTimezone,
  type HealthKind,
} from "@rebania/domain";
import { ArrowRight, CalendarDays } from "lucide-react";
import { useCallback } from "react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { GroupOutcome } from "../../components/GroupOutcome.tsx";
import { GroupPicker, SelectionSummary } from "../../components/GroupPicker.tsx";
import {
  doseRowsValid,
  emptyDose,
  parseDose,
  ProductDoses,
  toApplicationProducts,
  type DoseRow,
} from "../../components/ProductDoses.tsx";
import { Alert, Field, formatDate, Loading, PageHead, Steps } from "../../components/ui.tsx";
import { newMutationBase, type LocalAnimal, type SubmitResult } from "../../offline/engine.ts";
import { useDraft } from "../../state/draft.ts";
import { usePlan, useProducts } from "../../state/health.ts";
import { useLocalHerd } from "../../state/local-data.ts";
import { useSession } from "../../state/session.tsx";
import { useSync } from "../../state/sync.tsx";

interface Draft {
  step: 1 | 2 | 3;
  ids: string[];
  kind: HealthKind;
  date: string;
  rows: DoseRow[];
  applicator: string;
  reason: string;
  planItemId: string;
}

/**
 * T24 Aplicação (vacina, antiparasitário, medicamento) em grupo. Registra só os
 * animais marcados; resumo com consumo total e carência antes de gravar.
 */
export function ApplyPage() {
  const { farm, can } = useSession();
  const { engine } = useSync();
  const { animals, places } = useLocalHerd(farm!.id);
  const { products, offline } = useProducts(farm!.id);
  const { plan } = usePlan(farm!.id);
  const [params] = useSearchParams();
  const today = todayInTimezone(farm!.timezone);
  const treatmentId = params.get("tratamento") ?? "";
  const [d, setD, clear] = useDraft<Draft>(`apply:${farm!.id}:${treatmentId}`, {
    step: params.get("animais") ? 2 : 1,
    ids: params.get("animais")?.split(",").filter(Boolean) ?? [],
    kind: treatmentId ? "treatment" : ((params.get("tipo") as HealthKind) ?? "vaccination"),
    date: today,
    rows: [emptyDose()],
    applicator: "",
    reason: "",
    planItemId: params.get("plano") ?? "",
  });
  const [result, setResult] = useState<{
    r: SubmitResult;
    detail: GroupOperationResult | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const eligible = useCallback((a: LocalAnimal) => a.status === "active", []);

  if (!animals || !products) return <Loading />;
  const title = HEALTH_KIND_LABEL[d.kind];
  const dateError = !isCivilDate(d.date)
    ? "Data inválida."
    : daysBetween(today, d.date) > 0
      ? "Data no futuro."
      : null;
  const byId = new Map(products.map((p) => [p.id, p]));

  if (result) {
    return (
      <section>
        <PageHead title={title} back="/registrar" />
        <GroupOutcome result={result.r} detail={result.detail} animals={animals} label={title} />
        <div className="actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              clear();
              setResult(null);
            }}
          >
            Nova aplicação
          </button>
          <Link className="btn btn-secondary" to="/sanidade">
            Ver sanidade
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <PageHead title={title} back="/registrar" />
      <Steps current={d.step} />
      {offline ? (
        <Alert kind="info">
          Sem conexão: usando a última lista de produtos guardada neste aparelho.
        </Alert>
      ) : null}

      {d.step === 1 ? (
        <div className="card">
          <GroupPicker
            animals={animals}
            places={places}
            eligible={eligible}
            selected={d.ids}
            onChange={(ids) => set("ids", ids)}
            hint="Marque só os animais efetivamente tratados. Para curral com leitor, use o Modo Curral."
          />
          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              disabled={!d.ids.length}
              onClick={() => set("step", 2)}
            >
              Continuar com {d.ids.length} <ArrowRight size={20} aria-hidden="true" />
            </button>
            <Link className="btn btn-ghost" to="/curral/nova">
              Usar Modo Curral
            </Link>
          </div>
        </div>
      ) : null}

      {d.step === 2 ? (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            if (!dateError && doseRowsValid(d.rows)) set("step", 3);
          }}
        >
          {!treatmentId ? (
            <div className="field">
              <label>Tipo</label>
              <div className="seg" role="radiogroup" aria-label="Tipo de aplicação">
                {HEALTH_KINDS.map((k) => (
                  <label key={k}>
                    <input
                      type="radio"
                      name="kind"
                      checked={d.kind === k}
                      onChange={() => set("kind", k)}
                    />{" "}
                    {HEALTH_KIND_LABEL[k]}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <Alert kind="info">Aplicação vinculada ao tratamento em andamento.</Alert>
          )}
          <Field
            id="h-date"
            label="Data da aplicação"
            error={dateError}
            icon={<CalendarDays size={22} aria-hidden="true" />}
          >
            <input
              id="h-date"
              type="date"
              max={today}
              value={d.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </Field>
          <ProductDoses
            products={products}
            rows={d.rows}
            onChange={(rows) => set("rows", rows)}
            date={d.date}
            canManageStock={can("stock.manage") || can("health.manage")}
          />
          <div className="grid two" style={{ gap: 12, marginTop: 12 }}>
            <Field id="h-app" label="Aplicador" hint="opcional">
              <input
                id="h-app"
                value={d.applicator}
                onChange={(e) => set("applicator", e.target.value)}
              />
            </Field>
            {plan && plan.length && !treatmentId ? (
              <Field id="h-plan" label="Item do calendário" hint="opcional">
                <select
                  id="h-plan"
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
          <Field id="h-reason" label="Motivo / observação" hint="opcional">
            <input id="h-reason" value={d.reason} onChange={(e) => set("reason", e.target.value)} />
          </Field>
          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              disabled={Boolean(dateError) || !doseRowsValid(d.rows)}
            >
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
          <h2>Revise antes de confirmar</h2>
          <dl>
            <dt>Tipo</dt>
            <dd>{title}</dd>
            <dt>Data</dt>
            <dd>{formatDate(d.date)}</dd>
            {d.applicator ? (
              <>
                <dt>Aplicador</dt>
                <dd>{d.applicator}</dd>
              </>
            ) : null}
          </dl>
          <SelectionSummary animals={animals} ids={d.ids} />
          <h3 style={{ margin: "16px 0 8px" }}>Produtos e consumo de estoque</h3>
          <ul className="list">
            {d.rows.map((r, i) => {
              const p = byId.get(r.productId)!;
              const dose = parseDose(r.dose)!;
              const total = Math.round(dose * d.ids.length * 1000) / 1000;
              const after = Math.round((p.balance - total) * 1000) / 1000;
              const meat =
                p.withdrawalMeatDays !== null ? addDays(d.date, p.withdrawalMeatDays) : null;
              return (
                <li key={i} className="list-item" style={{ display: "block" }}>
                  <span className="title">{p.name}</span>
                  <div className="meta">
                    {formatQuantity(dose, p.unit)} por animal
                    {r.route ? ` · ${ADMIN_ROUTE_LABEL[r.route]}` : ""} · total{" "}
                    {formatQuantity(total, p.unit)} · saldo após{" "}
                    <strong style={{ color: after < 0 ? "var(--color-danger)" : undefined }}>
                      {formatQuantity(after, p.unit)}
                    </strong>
                  </div>
                  <div className="meta">
                    {meat
                      ? `Carência de carne até ${formatDate(meat)}`
                      : "Carência não configurada para este produto"}
                  </div>
                  {after < 0 ? (
                    <div className="meta" style={{ color: "var(--color-warning)" }}>
                      Saldo ficará negativo: a aplicação é registrada e o estoque vai para
                      conferência.
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const op = crypto.randomUUID();
                const payload: HealthApplyInput = {
                  kind: d.kind,
                  date: d.date,
                  animalIds: d.ids,
                  products: toApplicationProducts(d.rows),
                  ...(d.applicator ? { applicator: d.applicator } : {}),
                  ...(d.reason ? { reason: d.reason } : {}),
                  ...(d.planItemId ? { planItemId: d.planItemId } : {}),
                  ...(treatmentId ? { treatmentId } : {}),
                };
                const r = await engine.submit({
                  ...newMutationBase(op),
                  type: "health.apply",
                  payload,
                });
                setBusy(false);
                setResult({
                  r,
                  detail:
                    r.status === "synced" ? ((r.detail as GroupOperationResult) ?? null) : null,
                });
              }}
            >
              {busy ? "Registrando…" : `Confirmar ${d.ids.length} aplicação(ões)`}
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
