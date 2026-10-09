import { daysBetween, isCivilDate, STATUS_LABEL, todayInTimezone } from "@rebania/domain";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { IdentifyAnimal } from "../../components/IdentifyAnimal.tsx";
import { SelectedAnimal } from "../../components/SelectedAnimal.tsx";
import { Alert, Field, Loading, PageHead, Steps } from "../../components/ui.tsx";
import { newMutationBase, type SubmitResult } from "../../offline/engine.ts";
import { useDraft } from "../../state/draft.ts";
import { useLocalHerd } from "../../state/local-data.ts";
import { useSession } from "../../state/session.tsx";
import { useSync } from "../../state/sync.tsx";

type Kind = "dead" | "culled" | "transferred_out";
const KINDS: Kind[] = ["dead", "culled", "transferred_out"];
const KIND_HELP: Record<Kind, string> = {
  dead: "Causa da morte (ex.: picada de cobra, parto, desconhecida)",
  culled: "Motivo do descarte (ex.: idade, falha reprodutiva) — venda use Compra e venda",
  transferred_out: "Destino (outra fazenda/propriedade)",
};

/** Saída do rebanho: morte, descarte ou transferência. Encerra a situação sem apagar histórico. */
export function ExitPage() {
  const { farm } = useSession();
  const { engine } = useSync();
  const { animals } = useLocalHerd(farm!.id);
  const [params] = useSearchParams();
  const today = todayInTimezone(farm!.timezone);
  const [d, setD, clear] = useDraft(`exit:${farm!.id}`, {
    animalId: params.get("animal") ?? "",
    kind: "dead" as Kind,
    date: today,
    reason: "",
    notes: "",
  });
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [busy, setBusy] = useState(false);
  if (!animals) return <Loading />;
  const animal = animals.find((a) => a.id === d.animalId);
  const dateError = !isCivilDate(d.date)
    ? "Data inválida."
    : daysBetween(today, d.date) > 0
      ? "Data no futuro."
      : null;

  if (result) {
    return (
      <section>
        <PageHead title="Saída do rebanho" back="/registrar" />
        {result.status === "synced" ? (
          <Alert kind="success">
            Saída registrada e sincronizada. O histórico do animal foi mantido.
          </Alert>
        ) : result.status === "saved_locally" ? (
          <Alert kind="warning">Salvo no aparelho. Enviaremos quando houver conexão.</Alert>
        ) : (
          <Alert kind="danger">Não registrado: {result.message}</Alert>
        )}
        <div className="actions">
          <Link className="btn btn-primary" to="/rebanho">
            Rebanho
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <PageHead title="Saída do rebanho" back="/registrar" />
      <Steps current={!animal ? 1 : confirming ? 3 : 2} />
      {!animal ? (
        <div className="card">
          <IdentifyAnimal
            animals={animals}
            filter={(a) => a.status === "active"}
            onSelect={(a) => setD((p) => ({ ...p, animalId: a.id }))}
          />
        </div>
      ) : (
        <>
          <SelectedAnimal animal={animal} onChange={() => setD((p) => ({ ...p, animalId: "" }))} />
          <form
            className="card"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!confirming) {
                if (!dateError && d.reason.trim().length >= 2) setConfirming(true);
                return;
              }
              setBusy(true);
              const r = await engine.submit({
                ...newMutationBase(animal.id),
                type: "animal.exit",
                payload: {
                  kind: d.kind,
                  date: d.date,
                  reason: d.reason.trim(),
                  ...(d.notes.trim() ? { notes: d.notes.trim() } : {}),
                },
              });
              setBusy(false);
              if (r.status !== "rejected") clear();
              setResult(r);
            }}
          >
            <div className="field">
              <label>Tipo de saída</label>
              <div className="seg" role="radiogroup" aria-label="Tipo de saída">
                {KINDS.map((k) => (
                  <label key={k}>
                    <input
                      type="radio"
                      name="kind"
                      checked={d.kind === k}
                      onChange={() => setD((p) => ({ ...p, kind: k }))}
                      disabled={confirming}
                    />{" "}
                    {STATUS_LABEL[k]}
                  </label>
                ))}
              </div>
            </div>
            <Field
              id="x-date"
              label="Data"
              error={dateError}
              icon={<CalendarDays size={22} aria-hidden="true" />}
            >
              <input
                id="x-date"
                type="date"
                max={today}
                value={d.date}
                disabled={confirming}
                onChange={(e) => setD((p) => ({ ...p, date: e.target.value }))}
              />
            </Field>
            <Field id="x-reason" label={KIND_HELP[d.kind]}>
              <input
                id="x-reason"
                required
                minLength={2}
                value={d.reason}
                disabled={confirming}
                onChange={(e) => setD((p) => ({ ...p, reason: e.target.value }))}
              />
            </Field>
            <Field id="x-notes" label="Observações" hint="opcional">
              <input
                id="x-notes"
                value={d.notes}
                disabled={confirming}
                onChange={(e) => setD((p) => ({ ...p, notes: e.target.value }))}
              />
            </Field>
            {confirming ? (
              <Alert kind="warning">
                {animal.primaryIdentifier} passará a “{STATUS_LABEL[d.kind]}” e deixa de receber
                manejos. Tarefas pendentes dele serão encerradas. Confirma?
              </Alert>
            ) : null}
            <div className="actions">
              <button className="btn btn-primary btn-lg" disabled={busy || Boolean(dateError)}>
                {confirming ? (busy ? "Registrando…" : "Confirmar saída") : "Revisar"}
              </button>
              {confirming ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setConfirming(false)}
                >
                  Editar
                </button>
              ) : null}
            </div>
          </form>
        </>
      )}
    </section>
  );
}
