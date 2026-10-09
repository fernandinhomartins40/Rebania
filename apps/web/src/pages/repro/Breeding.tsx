import type { BreedingInput, GroupOperationResult } from "@rebania/contracts";
import {
  BREEDING_KINDS,
  BREEDING_LABEL,
  daysBetween,
  isCivilDate,
  todayInTimezone,
  type BreedingKind,
} from "@rebania/domain";
import { ArrowRight, CalendarDays } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { get } from "../../api/client.ts";
import { GroupOutcome } from "../../components/GroupOutcome.tsx";
import { GroupPicker, SelectionSummary } from "../../components/GroupPicker.tsx";
import { Field, Loading, PageHead, Steps, formatDate } from "../../components/ui.tsx";
import { newMutationBase, type LocalAnimal, type SubmitResult } from "../../offline/engine.ts";
import { useDraft } from "../../state/draft.ts";
import { useLocalHerd } from "../../state/local-data.ts";
import { useSession } from "../../state/session.tsx";
import { useSync } from "../../state/sync.tsx";

interface Draft {
  step: 1 | 2 | 3;
  ids: string[];
  kind: BreedingKind;
  date: string;
  endDate: string;
  sireId: string;
  semen: string;
  technician: string;
  seasonId: string;
  executionId: string;
}

/** T18 Inseminação / monta natural / repasse em grupo: identificar → informar → confirmar. */
export function BreedingPage() {
  const { farm } = useSession();
  const { engine } = useSync();
  const { animals, places } = useLocalHerd(farm!.id);
  const [params] = useSearchParams();
  const today = todayInTimezone(farm!.timezone);
  const [d, setD, clear] = useDraft<Draft>(`breeding:${farm!.id}`, {
    step: 1,
    ids: params.get("animais")?.split(",").filter(Boolean) ?? [],
    kind: "artificial_insemination",
    date: today,
    endDate: "",
    sireId: "",
    semen: "",
    technician: "",
    seasonId: "",
    executionId: params.get("execucao") ?? "",
  });
  const [seasons, setSeasons] = useState<{ id: string; name: string }[]>([]);
  const [result, setResult] = useState<{
    r: SubmitResult;
    detail: GroupOperationResult | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  useEffect(() => {
    get<{ id: string; name: string }[]>(`/v1/farms/${farm!.id}/breeding-seasons`).then(
      setSeasons,
      () => setSeasons([]),
    );
  }, [farm]);
  const eligible = useCallback(
    (a: LocalAnimal) =>
      a.sex === "female" &&
      (a.category === "heifer" || a.category === "cow") &&
      a.repro?.status !== "pregnant",
    [],
  );

  if (!animals) return <Loading />;
  const bulls = animals.filter((a) => a.status === "active" && a.category === "bull");
  const dateError = !isCivilDate(d.date)
    ? "Data inválida."
    : daysBetween(today, d.date) > 0
      ? "Data no futuro."
      : null;
  const endError =
    d.kind !== "artificial_insemination" && d.endDate && d.endDate < d.date
      ? "Fim antes do início."
      : null;

  if (result) {
    return (
      <section>
        <PageHead title="Cobertura e inseminação" back="/registrar" />
        <GroupOutcome
          result={result.r}
          detail={result.detail}
          animals={animals}
          label={BREEDING_LABEL[d.kind]}
        />
        <div className="actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              clear();
              setResult(null);
            }}
          >
            Novo registro
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <PageHead title="Cobertura e inseminação" back="/registrar" />
      <Steps current={d.step} />
      {d.step === 1 ? (
        <div className="card">
          <GroupPicker
            animals={animals}
            places={places}
            eligible={eligible}
            selected={d.ids}
            onChange={(ids) => set("ids", ids)}
            hint="Novilhas e vacas que não constam como prenhas. Marque só as efetivamente manejadas."
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
            if (!dateError && !endError) set("step", 3);
          }}
        >
          <div className="field">
            <label>Tipo</label>
            <div className="seg" role="radiogroup" aria-label="Tipo de cobertura">
              {BREEDING_KINDS.map((k) => (
                <label key={k}>
                  <input
                    type="radio"
                    name="kind"
                    checked={d.kind === k}
                    onChange={() => set("kind", k)}
                  />{" "}
                  {BREEDING_LABEL[k]}
                </label>
              ))}
            </div>
          </div>
          <div className="grid two">
            <Field
              id="b-date"
              label={
                d.kind === "artificial_insemination" ? "Data da inseminação" : "Início da exposição"
              }
              error={dateError}
              icon={<CalendarDays size={22} aria-hidden="true" />}
            >
              <input
                id="b-date"
                type="date"
                max={today}
                value={d.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </Field>
            {d.kind !== "artificial_insemination" ? (
              <Field
                id="b-end"
                label="Fim da exposição"
                hint="opcional"
                error={endError}
                icon={<CalendarDays size={22} aria-hidden="true" />}
              >
                <input
                  id="b-end"
                  type="date"
                  max={today}
                  value={d.endDate}
                  onChange={(e) => set("endDate", e.target.value)}
                />
              </Field>
            ) : null}
          </div>
          <div className="grid two">
            <Field id="b-sire" label="Touro" hint="opcional; deixe em branco se desconhecido">
              <select id="b-sire" value={d.sireId} onChange={(e) => set("sireId", e.target.value)}>
                <option value="">Não informado</option>
                {bulls.map((b) => (
                  <option key={b.id} value={b.id}>
                    Touro {b.primaryIdentifier}
                    {b.breed ? ` · ${b.breed}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            {d.kind === "artificial_insemination" ? (
              <Field id="b-semen" label="Sêmen (touro/partida)" hint="opcional">
                <input
                  id="b-semen"
                  value={d.semen}
                  onChange={(e) => set("semen", e.target.value)}
                />
              </Field>
            ) : null}
          </div>
          <div className="grid two">
            <Field
              id="b-tech"
              label={d.kind === "artificial_insemination" ? "Inseminador" : "Responsável"}
              hint="opcional"
            >
              <input
                id="b-tech"
                value={d.technician}
                onChange={(e) => set("technician", e.target.value)}
              />
            </Field>
            <Field id="b-season" label="Estação de monta" hint="opcional">
              <select
                id="b-season"
                value={d.seasonId}
                onChange={(e) => set("seasonId", e.target.value)}
              >
                <option value="">Nenhuma</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="actions">
            <button className="btn btn-primary btn-lg" disabled={Boolean(dateError || endError)}>
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
            <dd>{BREEDING_LABEL[d.kind]}</dd>
            <dt>Data</dt>
            <dd>
              {formatDate(d.date)}
              {d.endDate ? ` a ${formatDate(d.endDate)}` : ""}
            </dd>
            <dt>Touro</dt>
            <dd>{bulls.find((b) => b.id === d.sireId)?.primaryIdentifier ?? "Não informado"}</dd>
            {d.semen ? (
              <>
                <dt>Sêmen</dt>
                <dd>{d.semen}</dd>
              </>
            ) : null}
          </dl>
          <SelectionSummary animals={animals} ids={d.ids} />
          <p className="hint">
            O diagnóstico de prenhez será agendado conforme o prazo configurado da fazenda.
          </p>
          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const op = crypto.randomUUID();
                const payload: BreedingInput = {
                  kind: d.kind,
                  date: d.date,
                  femaleIds: d.ids,
                  ...(d.endDate && d.kind !== "artificial_insemination"
                    ? { endDate: d.endDate }
                    : {}),
                  ...(d.sireId ? { sireId: d.sireId } : {}),
                  ...(d.semen ? { semen: d.semen } : {}),
                  ...(d.technician ? { technician: d.technician } : {}),
                  ...(d.seasonId ? { seasonId: d.seasonId } : {}),
                  ...(d.executionId ? { executionId: d.executionId } : {}),
                };
                const r = await engine.submit({
                  ...newMutationBase(op),
                  type: "breeding.record",
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
              {busy ? "Registrando…" : `Confirmar ${d.ids.length} registro(s)`}
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
