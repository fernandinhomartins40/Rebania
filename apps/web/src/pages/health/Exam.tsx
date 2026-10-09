import type { GroupOperationResult } from "@rebania/contracts";
import {
  daysBetween,
  EXAM_KIND_LABEL,
  EXAM_KINDS,
  isCivilDate,
  todayInTimezone,
  type ExamKind,
} from "@rebania/domain";
import { ArrowRight, CalendarDays } from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "react-router";
import { errorMessage, NetworkError, post } from "../../api/client.ts";
import { GroupPicker, SelectionSummary } from "../../components/GroupPicker.tsx";
import { Alert, Field, Loading, PageHead, Steps } from "../../components/ui.tsx";
import type { LocalAnimal } from "../../offline/engine.ts";
import { useDraft } from "../../state/draft.ts";
import { useLocalHerd } from "../../state/local-data.ts";
import { useSession } from "../../state/session.tsx";

interface Draft {
  step: 1 | 2 | 3;
  ids: string[];
  kind: ExamKind;
  collectedOn: string;
  responsible: string;
  notes: string;
  key: string;
}

/** T26 Exames: coleta em animal/grupo; resultado informado depois pelo laboratório. */
export function ExamPage() {
  const { farm } = useSession();
  const { animals, places } = useLocalHerd(farm!.id);
  const today = todayInTimezone(farm!.timezone);
  const [d, setD, clear] = useDraft<Draft>(`exam:${farm!.id}`, {
    step: 1,
    ids: [],
    kind: "brucellosis",
    collectedOn: today,
    responsible: "",
    notes: "",
    key: crypto.randomUUID(),
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<GroupOperationResult | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const eligible = useCallback((a: LocalAnimal) => a.status === "active", []);

  if (!animals) return <Loading />;
  const dateError = !isCivilDate(d.collectedOn)
    ? "Data inválida."
    : daysBetween(today, d.collectedOn) > 0
      ? "Data no futuro."
      : null;

  if (done) {
    return (
      <section>
        <PageHead title="Exame" back="/registrar" />
        <Alert kind="success">
          Coleta registrada para {done.done.length} animal(is). Informe o resultado quando chegar.
        </Alert>
        {done.exceptions.length ? (
          <Alert kind="warning">
            {done.exceptions.length} exceção(ões):{" "}
            {done.exceptions.map((e) => e.message).join("; ")}
          </Alert>
        ) : null}
        <div className="actions">
          <Link className="btn btn-primary" to="/sanidade?aba=exames">
            Ver exames
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <PageHead title="Exame" back="/registrar" />
      <Steps current={d.step} />
      {d.step === 1 ? (
        <div className="card">
          <GroupPicker
            animals={animals}
            places={places}
            eligible={eligible}
            selected={d.ids}
            onChange={(ids) => set("ids", ids)}
            hint="Marque os animais com amostra coletada."
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
      ) : (
        <form
          className="card"
          onSubmit={async (e) => {
            e.preventDefault();
            if (d.step === 2) {
              if (!dateError) set("step", 3);
              return;
            }
            setBusy(true);
            setError(null);
            try {
              const r = await post<GroupOperationResult>(
                `/v1/farms/${farm!.id}/exams`,
                {
                  kind: d.kind,
                  animalIds: d.ids,
                  collectedOn: d.collectedOn,
                  ...(d.responsible.trim() ? { responsible: d.responsible.trim() } : {}),
                  ...(d.notes.trim() ? { notes: d.notes.trim() } : {}),
                },
                { idempotencyKey: d.key },
              );
              clear();
              setDone(r);
            } catch (err) {
              setError(
                err instanceof NetworkError
                  ? "Sem conexão. O rascunho fica guardado; tente de novo quando houver sinal."
                  : errorMessage(err),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {error ? <Alert kind="danger">{error}</Alert> : null}
          {d.step === 2 ? (
            <>
              <Field id="e-kind" label="Exame">
                <select
                  id="e-kind"
                  value={d.kind}
                  onChange={(e) => set("kind", e.target.value as ExamKind)}
                >
                  {EXAM_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {EXAM_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                id="e-date"
                label="Data da coleta"
                error={dateError}
                icon={<CalendarDays size={22} aria-hidden="true" />}
              >
                <input
                  id="e-date"
                  type="date"
                  max={today}
                  value={d.collectedOn}
                  onChange={(e) => set("collectedOn", e.target.value)}
                />
              </Field>
              <Field id="e-resp" label="Responsável / laboratório" hint="opcional">
                <input
                  id="e-resp"
                  value={d.responsible}
                  onChange={(e) => set("responsible", e.target.value)}
                />
              </Field>
              <Field id="e-notes" label="Observações" hint="opcional">
                <input
                  id="e-notes"
                  value={d.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </Field>
              <div className="actions">
                <button className="btn btn-primary btn-lg" disabled={Boolean(dateError)}>
                  Revisar <ArrowRight size={20} aria-hidden="true" />
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => set("step", 1)}>
                  Voltar
                </button>
              </div>
            </>
          ) : (
            <div className="review">
              <h2>Revise antes de confirmar</h2>
              <dl>
                <dt>Exame</dt>
                <dd>{EXAM_KIND_LABEL[d.kind]}</dd>
                <dt>Coleta</dt>
                <dd>{d.collectedOn.split("-").reverse().join("/")}</dd>
              </dl>
              <SelectionSummary animals={animals} ids={d.ids} />
              <div className="actions">
                <button className="btn btn-primary btn-lg" disabled={busy}>
                  {busy ? "Registrando…" : `Confirmar ${d.ids.length} coleta(s)`}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => set("step", 2)}>
                  Editar
                </button>
              </div>
            </div>
          )}
        </form>
      )}
    </section>
  );
}
