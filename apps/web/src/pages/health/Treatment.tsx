import { daysBetween, isCivilDate, todayInTimezone } from "@rebania/domain";
import { ArrowRight, CalendarDays, Syringe } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { errorMessage, NetworkError, post } from "../../api/client.ts";
import { IdentifyAnimal } from "../../components/IdentifyAnimal.tsx";
import { SelectedAnimal } from "../../components/SelectedAnimal.tsx";
import { Alert, Field, Loading, PageHead, Steps } from "../../components/ui.tsx";
import { useDraft } from "../../state/draft.ts";
import { useLocalHerd } from "../../state/local-data.ts";
import { useSession } from "../../state/session.tsx";

interface Draft {
  animalId: string;
  startedOn: string;
  condition: string;
  plan: string;
  responsible: string;
  key: string;
}

/** T25 Tratamento: ocorrência, plano informado pelo responsável, aplicações e resposta. */
export function TreatmentPage() {
  const { farm } = useSession();
  const { animals } = useLocalHerd(farm!.id);
  const [params] = useSearchParams();
  const today = todayInTimezone(farm!.timezone);
  const [d, setD, clear] = useDraft<Draft>(`treatment:${farm!.id}`, {
    animalId: params.get("animal") ?? "",
    startedOn: today,
    condition: "",
    plan: "",
    responsible: "",
    key: crypto.randomUUID(),
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; animalId: string } | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  if (!animals) return <Loading />;
  const animal = animals.find((a) => a.id === d.animalId);
  const dateError = !isCivilDate(d.startedOn)
    ? "Data inválida."
    : daysBetween(today, d.startedOn) > 0
      ? "Data no futuro."
      : null;

  if (done) {
    return (
      <section>
        <PageHead title="Tratamento" back="/registrar" />
        <Alert kind="success">Tratamento iniciado e sincronizado.</Alert>
        <div className="actions">
          <Link
            className="btn btn-primary"
            to={`/registrar/aplicacao?animais=${done.animalId}&tratamento=${done.id}`}
          >
            <Syringe size={20} aria-hidden="true" /> Registrar aplicação
          </Link>
          <Link className="btn btn-secondary" to="/sanidade?aba=tratamentos">
            Ver tratamentos
          </Link>
        </div>
      </section>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (dateError || !animal) return;
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ id: string }>(
        `/v1/farms/${farm!.id}/treatments`,
        {
          id: d.key,
          animalId: animal.id,
          startedOn: d.startedOn,
          condition: d.condition.trim(),
          ...(d.plan.trim() ? { plan: d.plan.trim() } : {}),
          ...(d.responsible.trim() ? { responsible: d.responsible.trim() } : {}),
        },
        { idempotencyKey: d.key },
      );
      clear();
      setDone({ id: r.id, animalId: animal.id });
    } catch (err) {
      setError(
        err instanceof NetworkError
          ? "Sem conexão. O rascunho fica guardado; tente de novo quando houver sinal."
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHead title="Tratamento" back="/registrar" />
      <Steps current={animal ? 2 : 1} labels={["Identificar", "Informar", "Confirmar"]} />
      {!animal ? (
        <div className="card">
          <IdentifyAnimal
            animals={animals}
            filter={(a) => a.status === "active"}
            onSelect={(a) => set("animalId", a.id)}
          />
        </div>
      ) : (
        <>
          <SelectedAnimal animal={animal} onChange={() => set("animalId", "")} />
          <form className="card" onSubmit={submit}>
            {error ? <Alert kind="danger">{error}</Alert> : null}
            <Field id="t-cond" label="Ocorrência / suspeita">
              <input
                id="t-cond"
                required
                minLength={2}
                placeholder="Ex.: claudicação, diarreia, tristeza parasitária"
                value={d.condition}
                onChange={(e) => set("condition", e.target.value)}
              />
            </Field>
            <Field
              id="t-date"
              label="Início"
              error={dateError}
              icon={<CalendarDays size={22} aria-hidden="true" />}
            >
              <input
                id="t-date"
                type="date"
                max={today}
                value={d.startedOn}
                onChange={(e) => set("startedOn", e.target.value)}
              />
            </Field>
            <Field id="t-plan" label="Plano do responsável técnico" hint="opcional">
              <textarea
                id="t-plan"
                rows={3}
                value={d.plan}
                onChange={(e) => set("plan", e.target.value)}
              />
            </Field>
            <Field id="t-resp" label="Responsável" hint="opcional">
              <input
                id="t-resp"
                value={d.responsible}
                onChange={(e) => set("responsible", e.target.value)}
              />
            </Field>
            <p className="hint">
              O Rebania registra o plano informado; não prescreve medicamentos nem doses.
            </p>
            <div className="actions">
              <button className="btn btn-primary btn-lg" disabled={busy || Boolean(dateError)}>
                {busy ? "Registrando…" : "Iniciar tratamento"}{" "}
                <ArrowRight size={20} aria-hidden="true" />
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
