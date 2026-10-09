import { assertWeightKg, daysBetween, DomainError, isCivilDate, todayInTimezone, weightConsistencyWarning, CATEGORY_LABEL } from "@rebania/domain";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { IdentifyAnimal } from "../components/IdentifyAnimal.tsx";
import { Alert, Field, formatDate, formatKg, Loading, Steps } from "../components/ui.tsx";
import { newMutationBase, putLocalAnimal, type SubmitResult } from "../offline/engine.ts";
import { useDraft } from "../state/draft.ts";
import { useLocalHerd } from "../state/local-data.ts";
import { useSession } from "../state/session.tsx";
import { useSync } from "../state/sync.tsx";
import { SubmitOutcome } from "./flow.tsx";

interface Draft {
  step: 1 | 2 | 3;
  animalId: string;
  weight: string;
  measuredOn: string;
}

/** T29 Pesagem: identificar → peso (digitado ou leitor) → confirmar. */
export function WeighPage() {
  const { farm } = useSession();
  const { engine } = useSync();
  const { animals } = useLocalHerd(farm!.id);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = todayInTimezone(farm!.timezone);
  const preset = params.get("animal");
  const [d, setD, clear] = useDraft<Draft>(`weigh:${farm!.id}`, {
    step: preset ? 2 : 1,
    animalId: preset ?? "",
    weight: "",
    measuredOn: today,
  });
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [done, setDone] = useState<{ animalId: string; weightKg: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  if (!animals) return <Loading />;
  const animal = animals.find((a) => a.id === d.animalId);
  const weightKg = Number(d.weight.replace(",", "."));
  const weightError = (() => {
    if (!d.weight) return null;
    try {
      assertWeightKg(weightKg);
      return null;
    } catch (e) {
      return e instanceof DomainError ? e.message : "Peso inválido.";
    }
  })();
  const dateError = !isCivilDate(d.measuredOn)
    ? "Data inválida."
    : daysBetween(today, d.measuredOn) > 0
      ? "A data não pode estar no futuro."
      : animal?.birthDate && daysBetween(animal.birthDate, d.measuredOn) < 0
        ? "Data anterior ao nascimento."
        : null;
  const warning =
    animal && d.weight && !weightError
      ? weightConsistencyWarning(animal.lastWeight ?? undefined, { measuredOn: d.measuredOn, weightKg })
      : null;

  if (result && done) {
    return (
      <section>
        <h1>Pesagem</h1>
        <SubmitOutcome
          result={result}
          successText={`Pesagem de ${formatKg(done.weightKg)} registrada`}
          restart={{
            label: "Pesar próximo animal",
            onClick: () => {
              clear();
              setResult(null);
              setDone(null);
            },
          }}
          next={[{ to: `/rebanho/${done.animalId}`, label: "Abrir passaporte" }]}
        />
      </section>
    );
  }

  return (
    <section>
      <h1>Pesagem</h1>
      <Steps current={d.step} />
      {d.step === 1 ? (
        <div className="card">
          <IdentifyAnimal
            animals={animals}
            filter={(a) => a.status === "active"}
            onSelect={(a) => setD((p) => ({ ...p, animalId: a.id, step: 2 }))}
          />
        </div>
      ) : null}

      {d.step >= 2 && !animal ? (
        <Alert kind="danger">Animal não encontrado nesta fazenda. <button className="btn btn-ghost" onClick={() => set("step", 1)}>Identificar outro</button></Alert>
      ) : null}

      {d.step === 2 && animal ? (
        <form className="card" onSubmit={(e) => { e.preventDefault(); if (d.weight && !weightError && !dateError) set("step", 3); }}>
          <p>
            <strong>{animal.primaryIdentifier}</strong> · {CATEGORY_LABEL[animal.category]} · {animal.groupName ?? "sem lote"}
            <br />
            <span className="hint">
              Última pesagem: {animal.lastWeight ? `${formatKg(animal.lastWeight.weightKg)} em ${formatDate(animal.lastWeight.measuredOn)}` : "nenhuma"}
            </span>
          </p>
          <Field id="weight" label="Peso vivo (kg)" error={weightError}>
            <input id="weight" autoFocus inputMode="decimal" value={d.weight} onChange={(e) => set("weight", e.target.value)} aria-invalid={Boolean(weightError)} />
          </Field>
          <Field id="measuredOn" label="Data da pesagem" error={dateError}>
            <input id="measuredOn" type="date" max={today} value={d.measuredOn} onChange={(e) => set("measuredOn", e.target.value)} />
          </Field>
          {warning ? <Alert kind="warning">{warning}</Alert> : null}
          <div className="actions">
            <button className="btn btn-primary" disabled={!d.weight || Boolean(weightError || dateError)}>Revisar</button>
            <button type="button" className="btn btn-ghost" onClick={() => setD((p) => ({ ...p, step: 1, animalId: "" }))}>Trocar animal</button>
          </div>
        </form>
      ) : null}

      {d.step === 3 && animal ? (
        <div className="card review">
          <h2>Confirme a pesagem</h2>
          <dl>
            <dt>Animal</dt><dd>{animal.primaryIdentifier} · {CATEGORY_LABEL[animal.category]}</dd>
            <dt>Peso vivo</dt><dd>{formatKg(weightKg)}</dd>
            <dt>Data</dt><dd>{formatDate(d.measuredOn)}</dd>
            <dt>Origem</dt><dd>Digitado</dd>
          </dl>
          {warning ? <Alert kind="warning">{warning}</Alert> : null}
          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await engine.submit(
                  { ...newMutationBase(animal.id), type: "weight.record", payload: { weightKg, measuredOn: d.measuredOn, source: "manual" } },
                  async () => {
                    const newer = !animal.lastWeight || daysBetween(animal.lastWeight.measuredOn, d.measuredOn) >= 0;
                    await putLocalAnimal({ ...animal, pending: true, lastWeight: newer ? { weightKg, measuredOn: d.measuredOn } : animal.lastWeight });
                  },
                );
                setBusy(false);
                setDone({ animalId: animal.id, weightKg });
                setResult(r);
                if (r.status !== "rejected") clear();
              }}
            >
              {busy ? "Registrando…" : "Confirmar pesagem"}
            </button>
            <button className="btn btn-ghost" onClick={() => set("step", 2)}>Editar</button>
            <button className="btn btn-ghost" onClick={() => { clear(); navigate("/registrar"); }}>Cancelar</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
