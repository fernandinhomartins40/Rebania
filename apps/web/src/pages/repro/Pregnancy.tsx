import type { GroupOperationResult, PregnancyCheckInput } from "@rebania/contracts";
import {
  daysBetween,
  isCivilDate,
  PREGNANCY_LABEL,
  PREGNANCY_RESULTS,
  todayInTimezone,
  type PregnancyResultValue,
} from "@rebania/domain";
import { ArrowRight, CalendarDays } from "lucide-react";
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router";
import { GroupOutcome } from "../../components/GroupOutcome.tsx";
import { GroupPicker } from "../../components/GroupPicker.tsx";
import { Field, Loading, PageHead, Steps, formatDate } from "../../components/ui.tsx";
import { newMutationBase, type LocalAnimal, type SubmitResult } from "../../offline/engine.ts";
import { useDraft } from "../../state/draft.ts";
import { useLocalHerd } from "../../state/local-data.ts";
import { useSession } from "../../state/session.tsx";
import { useSync } from "../../state/sync.tsx";

interface Draft {
  step: 1 | 2 | 3;
  ids: string[];
  date: string;
  method: "ultrasound" | "palpation" | "other";
  examiner: string;
  results: Record<string, { result: PregnancyResultValue | ""; days: string }>;
}

/** T19 Diagnóstico de prenhez em grupo. Resultado por animal; ausência de diagnóstico ≠ vazia. */
export function PregnancyPage() {
  const { farm } = useSession();
  const { engine } = useSync();
  const { animals, places } = useLocalHerd(farm!.id);
  const [params] = useSearchParams();
  const today = todayInTimezone(farm!.timezone);
  const [d, setD, clear] = useDraft<Draft>(`pregnancy:${farm!.id}`, {
    step: 1,
    ids: params.get("animais")?.split(",").filter(Boolean) ?? [],
    date: today,
    method: "ultrasound",
    examiner: "",
    results: {},
  });
  const [result, setResult] = useState<{
    r: SubmitResult;
    detail: GroupOperationResult | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const eligible = useCallback(
    (a: LocalAnimal) => a.sex === "female" && (a.category === "heifer" || a.category === "cow"),
    [],
  );
  if (!animals) return <Loading />;
  const byId = new Map(animals.map((a) => [a.id, a]));
  const dateError = !isCivilDate(d.date)
    ? "Data inválida."
    : daysBetween(today, d.date) > 0
      ? "Data no futuro."
      : null;
  const filled = d.ids.filter((id) => d.results[id]?.result);
  const setResultFor = (id: string, patch: Partial<Draft["results"][string]>) =>
    setD((p) => ({
      ...p,
      results: { ...p.results, [id]: { result: "", days: "", ...p.results[id], ...patch } },
    }));

  if (result) {
    return (
      <section>
        <PageHead title="Diagnóstico de prenhez" back="/registrar" />
        <GroupOutcome
          result={result.r}
          detail={result.detail}
          animals={animals}
          label="Diagnóstico"
        />
        <div className="actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              clear();
              setResult(null);
            }}
          >
            Novo diagnóstico
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <PageHead title="Diagnóstico de prenhez" back="/registrar" />
      <Steps current={d.step} />
      {d.step === 1 ? (
        <div className="card">
          <GroupPicker
            animals={animals}
            places={places}
            eligible={eligible}
            selected={d.ids}
            onChange={(ids) => set("ids", ids)}
            hint="Selecione as fêmeas examinadas."
          />
          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              disabled={!d.ids.length}
              onClick={() => set("step", 2)}
            >
              Informar resultados <ArrowRight size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
      {d.step === 2 ? (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            if (!dateError && filled.length) set("step", 3);
          }}
        >
          <div className="grid two">
            <Field
              id="p-date"
              label="Data do exame"
              error={dateError}
              icon={<CalendarDays size={22} aria-hidden="true" />}
            >
              <input
                id="p-date"
                type="date"
                max={today}
                value={d.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </Field>
            <Field id="p-exam" label="Responsável" hint="veterinário">
              <input
                id="p-exam"
                value={d.examiner}
                onChange={(e) => set("examiner", e.target.value)}
              />
            </Field>
          </div>
          <div className="field">
            <label>Método</label>
            <div className="seg">
              {(["ultrasound", "palpation", "other"] as const).map((m) => (
                <label key={m}>
                  <input
                    type="radio"
                    name="method"
                    checked={d.method === m}
                    onChange={() => set("method", m)}
                  />{" "}
                  {m === "ultrasound" ? "Ultrassom" : m === "palpation" ? "Toque" : "Outro"}
                </label>
              ))}
            </div>
          </div>
          <ul className="list">
            {d.ids.map((id) => {
              const a = byId.get(id);
              const r = d.results[id] ?? { result: "", days: "" };
              return (
                <li key={id} className="list-item" style={{ flexWrap: "wrap" }}>
                  <span className="title" style={{ minWidth: 110 }}>
                    {a?.primaryIdentifier ?? "?"}
                  </span>
                  <span
                    className="seg"
                    role="radiogroup"
                    aria-label={`Resultado ${a?.primaryIdentifier}`}
                  >
                    {PREGNANCY_RESULTS.map((v) => (
                      <label key={v}>
                        <input
                          type="radio"
                          name={`r-${id}`}
                          checked={r.result === v}
                          onChange={() => setResultFor(id, { result: v })}
                        />{" "}
                        {PREGNANCY_LABEL[v]}
                      </label>
                    ))}
                  </span>
                  {r.result === "pregnant" && d.method === "ultrasound" ? (
                    <input
                      aria-label="Dias de gestação"
                      placeholder="Dias de gestação (opcional)"
                      inputMode="numeric"
                      value={r.days}
                      onChange={(e) =>
                        setResultFor(id, { days: e.target.value.replace(/\D/g, "") })
                      }
                      style={{ maxWidth: 220 }}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="hint">
            Animais sem resultado marcado não serão registrados (continuam “sem diagnóstico”).
          </p>
          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              disabled={Boolean(dateError) || !filled.length}
            >
              Revisar {filled.length} <ArrowRight size={20} aria-hidden="true" />
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
            <dt>Data</dt>
            <dd>{formatDate(d.date)}</dd>
            {PREGNANCY_RESULTS.map((v) => (
              <span key={v} style={{ display: "contents" }}>
                <dt>{PREGNANCY_LABEL[v]}</dt>
                <dd>{filled.filter((id) => d.results[id]?.result === v).length}</dd>
              </span>
            ))}
            <dt>Sem resultado</dt>
            <dd>{d.ids.length - filled.length}</dd>
          </dl>
          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const payload: PregnancyCheckInput = {
                  date: d.date,
                  method: d.method,
                  ...(d.examiner ? { examiner: d.examiner } : {}),
                  results: filled.map((id) => ({
                    animalId: id,
                    result: d.results[id]!.result as PregnancyResultValue,
                    ...(d.results[id]!.result === "pregnant" && d.results[id]!.days
                      ? { estimatedGestationDays: Number(d.results[id]!.days) }
                      : {}),
                  })),
                };
                const r = await engine.submit({
                  ...newMutationBase(crypto.randomUUID()),
                  type: "pregnancy.record",
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
              {busy ? "Registrando…" : "Confirmar diagnósticos"}
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
