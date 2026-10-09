import { CATEGORY_LABEL, daysBetween, isCivilDate, todayInTimezone } from "@rebania/domain";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { IdentifyAnimal } from "../components/IdentifyAnimal.tsx";
import { Alert, Field, formatDate, Loading, Steps } from "../components/ui.tsx";
import { newMutationBase, putLocalAnimal, type SubmitResult } from "../offline/engine.ts";
import { useDraft } from "../state/draft.ts";
import { useLocalHerd } from "../state/local-data.ts";
import { useSession } from "../state/session.tsx";
import { useSync } from "../state/sync.tsx";
import { SubmitOutcome } from "./flow.tsx";

interface Draft {
  step: 1 | 2 | 3;
  animalId: string;
  groupId: string;
  pastureId: string;
  effectiveOn: string;
  reason: string;
  /** Versão do animal vista quando a movimentação foi preparada. */
  expectedVersion: number;
}

/** T32 Movimentação com data efetiva e controle de versão (conflito entre aparelhos é explícito). */
export function MovePage() {
  const { farm } = useSession();
  const { engine } = useSync();
  const { animals, places } = useLocalHerd(farm!.id);
  const [params] = useSearchParams();
  const today = todayInTimezone(farm!.timezone);
  const preset = params.get("animal");
  const [d, setD, clear] = useDraft<Draft>(`move:${farm!.id}`, {
    step: 1, animalId: preset ?? "", groupId: "", pastureId: "", effectiveOn: today, reason: "", expectedVersion: 0,
  });
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  if (!animals) return <Loading />;
  const animal = animals.find((a) => a.id === d.animalId);
  const step = preset && d.step === 1 && animal ? 2 : d.step;
  const groups = places.filter((p) => p.kind === "group");
  const pastures = places.filter((p) => p.kind === "pasture");
  const nameOf = (id: string) => places.find((p) => p.id === id)?.name ?? "—";
  const dateError = !isCivilDate(d.effectiveOn)
    ? "Data inválida."
    : daysBetween(today, d.effectiveOn) > 0
      ? "A data não pode estar no futuro."
      : null;
  const unchanged = animal && (animal.groupId ?? "") === d.groupId && (animal.pastureId ?? "") === d.pastureId;

  if (result && doneId) {
    return (
      <section>
        <h1>Movimentação</h1>
        <SubmitOutcome
          result={result}
          successText="Movimentação registrada"
          restart={{ label: "Movimentar outro animal", onClick: () => { clear(); setResult(null); setDoneId(null); } }}
          next={[{ to: `/rebanho/${doneId}`, label: "Abrir passaporte" }]}
        />
      </section>
    );
  }

  return (
    <section>
      <h1>Movimentação</h1>
      <Steps current={step} />
      {step === 1 ? (
        <div className="card">
          <IdentifyAnimal
            animals={animals}
            filter={(a) => a.status === "active"}
            onSelect={(a) =>
              setD((p) => ({ ...p, animalId: a.id, groupId: a.groupId ?? "", pastureId: a.pastureId ?? "", expectedVersion: a.version, step: 2 }))
            }
          />
        </div>
      ) : null}
      {step === 2 && animal ? (
        <form className="card" onSubmit={(e) => {
          e.preventDefault();
          if (!dateError && !unchanged) setD((p) => ({ ...p, step: 3, expectedVersion: p.expectedVersion || animal.version }));
        }}>
          <p>
            <strong>{animal.primaryIdentifier}</strong> · {CATEGORY_LABEL[animal.category]}
            <br />
            <span className="hint">Atual: {animal.groupName ?? "sem lote"} · {animal.pastureName ?? "sem pasto"}</span>
          </p>
          <div className="grid two">
            <Field id="dest-group" label="Lote de destino">
              <select id="dest-group" value={d.groupId} onChange={(e) => set("groupId", e.target.value)}>
                <option value="">Sem lote</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
            <Field id="dest-pasture" label="Pasto de destino">
              <select id="dest-pasture" value={d.pastureId} onChange={(e) => set("pastureId", e.target.value)}>
                <option value="">Sem pasto</option>
                {pastures.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
          </div>
          <Field id="effectiveOn" label="Data efetiva" error={dateError}>
            <input id="effectiveOn" type="date" max={today} value={d.effectiveOn} onChange={(e) => set("effectiveOn", e.target.value)} />
          </Field>
          <Field id="reason" label="Motivo" hint="opcional">
            <input id="reason" value={d.reason} onChange={(e) => set("reason", e.target.value)} />
          </Field>
          {unchanged ? <Alert kind="info">Escolha um destino diferente do atual.</Alert> : null}
          <div className="actions">
            <button className="btn btn-primary" disabled={Boolean(dateError || unchanged)}>Revisar</button>
            <button type="button" className="btn btn-ghost" onClick={() => setD((p) => ({ ...p, step: 1, animalId: "" }))}>Trocar animal</button>
          </div>
        </form>
      ) : null}
      {step === 3 && animal ? (
        <div className="card review">
          <h2>Confirme a movimentação</h2>
          <dl>
            <dt>Animal</dt><dd>{animal.primaryIdentifier}</dd>
            <dt>De</dt><dd>{animal.groupName ?? "sem lote"} · {animal.pastureName ?? "sem pasto"}</dd>
            <dt>Para</dt><dd>{d.groupId ? nameOf(d.groupId) : "sem lote"} · {d.pastureId ? nameOf(d.pastureId) : "sem pasto"}</dd>
            <dt>Data efetiva</dt><dd>{formatDate(d.effectiveOn)}</dd>
          </dl>
          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await engine.submit(
                  {
                    ...newMutationBase(animal.id),
                    type: "animal.move",
                    payload: {
                      expectedVersion: d.expectedVersion || animal.version,
                      groupId: d.groupId || null,
                      pastureId: d.pastureId || null,
                      effectiveOn: d.effectiveOn,
                      ...(d.reason ? { reason: d.reason } : {}),
                    },
                  },
                  () =>
                    putLocalAnimal({
                      ...animal,
                      pending: true,
                      groupId: d.groupId || null,
                      groupName: d.groupId ? nameOf(d.groupId) : null,
                      pastureId: d.pastureId || null,
                      pastureName: d.pastureId ? nameOf(d.pastureId) : null,
                    }),
                );
                setBusy(false);
                setDoneId(animal.id);
                setResult(r);
                if (r.status !== "rejected") clear();
              }}
            >
              {busy ? "Registrando…" : "Confirmar movimentação"}
            </button>
            <button className="btn btn-ghost" onClick={() => set("step", 2)}>Editar</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
