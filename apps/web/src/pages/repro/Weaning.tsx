import type { GroupOperationResult, WeaningInput } from "@rebania/contracts";
import { daysBetween, isCivilDate, todayInTimezone } from "@rebania/domain";
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
  weights: Record<string, string>;
}

/** T22 Desmama: bezerros(as) → novilha/garrote, peso opcional, conclui tarefas de desmama. */
export function WeaningPage() {
  const { farm } = useSession();
  const { engine } = useSync();
  const { animals, places } = useLocalHerd(farm!.id);
  const [params] = useSearchParams();
  const today = todayInTimezone(farm!.timezone);
  const [d, setD, clear] = useDraft<Draft>(`weaning:${farm!.id}`, {
    step: 1,
    ids: params.get("animais")?.split(",").filter(Boolean) ?? [],
    date: today,
    weights: {},
  });
  const [result, setResult] = useState<{
    r: SubmitResult;
    detail: GroupOperationResult | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const eligible = useCallback(
    (a: LocalAnimal) => a.category === "calf_female" || a.category === "calf_male",
    [],
  );
  if (!animals) return <Loading />;
  const byId = new Map(animals.map((a) => [a.id, a]));
  const dateError = !isCivilDate(d.date)
    ? "Data inválida."
    : daysBetween(today, d.date) > 0
      ? "Data no futuro."
      : null;
  const weightError = d.ids.some(
    (id) =>
      d.weights[id] &&
      !(
        Number(d.weights[id]!.replace(",", ".")) >= 10 &&
        Number(d.weights[id]!.replace(",", ".")) <= 600
      ),
  );

  if (result) {
    return (
      <section>
        <PageHead title="Desmama" back="/registrar" />
        <GroupOutcome result={result.r} detail={result.detail} animals={animals} label="Desmama" />
        <div className="actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              clear();
              setResult(null);
            }}
          >
            Nova desmama
          </button>
        </div>
      </section>
    );
  }
  return (
    <section>
      <PageHead title="Desmama" back="/registrar" />
      <Steps current={d.step} />
      {d.step === 1 ? (
        <div className="card">
          <GroupPicker
            animals={animals}
            places={places}
            eligible={eligible}
            selected={d.ids}
            onChange={(ids) => set("ids", ids)}
            hint="Bezerros e bezerras desmamados neste manejo."
          />
          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              disabled={!d.ids.length}
              onClick={() => set("step", 2)}
            >
              Continuar <ArrowRight size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
      {d.step === 2 ? (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            if (!dateError && !weightError) set("step", 3);
          }}
        >
          <Field
            id="w-date"
            label="Data da desmama"
            error={dateError}
            icon={<CalendarDays size={22} aria-hidden="true" />}
          >
            <input
              id="w-date"
              type="date"
              max={today}
              value={d.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </Field>
          <ul className="list">
            {d.ids.map((id) => (
              <li key={id} className="list-item">
                <span className="title">{byId.get(id)?.primaryIdentifier}</span>
                <input
                  aria-label={`Peso de ${byId.get(id)?.primaryIdentifier}`}
                  placeholder="Peso (kg, opcional)"
                  inputMode="decimal"
                  style={{ maxWidth: 200 }}
                  value={d.weights[id] ?? ""}
                  onChange={(e) =>
                    setD((p) => ({ ...p, weights: { ...p.weights, [id]: e.target.value } }))
                  }
                />
              </li>
            ))}
          </ul>
          {weightError ? <div className="field-error">Peso entre 10 e 600 kg.</div> : null}
          <div className="actions">
            <button className="btn btn-primary btn-lg" disabled={Boolean(dateError || weightError)}>
              Revisar <ArrowRight size={20} aria-hidden="true" />
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
            <dt>Animais</dt>
            <dd>{d.ids.length}</dd>
            <dt>Com peso</dt>
            <dd>{d.ids.filter((id) => d.weights[id]).length}</dd>
          </dl>
          <p className="hint">Bezerras passam a novilhas e bezerros a garrotes.</p>
          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const payload: WeaningInput = {
                  date: d.date,
                  items: d.ids.map((id) => ({
                    animalId: id,
                    ...(d.weights[id]
                      ? { weightKg: Number(d.weights[id]!.replace(",", ".")) }
                      : {}),
                  })),
                };
                const r = await engine.submit({
                  ...newMutationBase(crypto.randomUUID()),
                  type: "weaning.record",
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
              {busy ? "Registrando…" : "Confirmar desmama"}
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
