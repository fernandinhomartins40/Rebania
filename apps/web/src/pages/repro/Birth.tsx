import type { BirthInput } from "@rebania/contracts";
import {
  ASSISTANCE,
  ASSISTANCE_LABEL,
  daysBetween,
  isCivilDate,
  MAX_CALVES_PER_BIRTH,
  normalizeIdentifier,
  todayInTimezone,
  type Assistance,
} from "@rebania/domain";
import { ArrowRight, CalendarDays, Plus, Tag, Trash2, Weight } from "lucide-react";
import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { IdentifyAnimal } from "../../components/IdentifyAnimal.tsx";
import { SelectedAnimal } from "../../components/SelectedAnimal.tsx";
import { Alert, Field, Loading, PageHead, Steps, formatDate } from "../../components/ui.tsx";
import { newMutationBase, type LocalAnimal, type SubmitResult } from "../../offline/engine.ts";
import { useDraft } from "../../state/draft.ts";
import { useLocalHerd } from "../../state/local-data.ts";
import { useSession } from "../../state/session.tsx";
import { useSync } from "../../state/sync.tsx";

interface Calf {
  sex: "female" | "male" | "";
  stillborn: boolean;
  idType: "visual_tag" | "provisional";
  tag: string;
  weight: string;
}
interface Draft {
  step: 1 | 2 | 3;
  damId: string;
  date: string;
  assistance: Assistance;
  notes: string;
  calves: Calf[];
}
const emptyCalf = (): Calf => ({
  sex: "",
  stillborn: false,
  idType: "visual_tag",
  tag: "",
  weight: "",
});

/** Três etapas / Nasceu um bezerro (PR p.12): mãe → informar → revisar e confirmar. */
export function BirthPage() {
  const { farm } = useSession();
  const { engine } = useSync();
  const { animals } = useLocalHerd(farm!.id);
  const [params] = useSearchParams();
  const today = todayInTimezone(farm!.timezone);
  const [d, setD, clear] = useDraft<Draft>(`birth:${farm!.id}`, {
    step: params.get("mae") ? 2 : 1,
    damId: params.get("mae") ?? "",
    date: today,
    assistance: "none",
    notes: "",
    calves: [emptyCalf()],
  });
  const [result, setResult] = useState<{ r: SubmitResult; calfIds: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const setCalf = (i: number, patch: Partial<Calf>) =>
    setD((p) => ({ ...p, calves: p.calves.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const isDam = useCallback(
    (a: LocalAnimal) =>
      a.status === "active" &&
      a.sex === "female" &&
      (a.category === "heifer" || a.category === "cow"),
    [],
  );
  if (!animals) return <Loading />;
  const dam = animals.find((a) => a.id === d.damId);

  const dateError = !isCivilDate(d.date)
    ? "Data inválida."
    : daysBetween(today, d.date) > 0
      ? "Data no futuro."
      : null;
  const calfErrors = d.calves.map((c, i) => {
    if (!c.sex) return "Informe o sexo.";
    if (c.stillborn) return null;
    if (!c.tag.trim()) return "Informe o brinco ou um ID provisório.";
    try {
      const n = normalizeIdentifier(c.idType, c.tag);
      if (
        animals.some((a) =>
          a.identifiers.some((x) => x.status === "active" && x.type === c.idType && x.value === n),
        )
      )
        return "Identificador já usado.";
      if (
        d.calves.some(
          (o, j) =>
            j !== i &&
            !o.stillborn &&
            o.idType === c.idType &&
            o.tag.trim().toUpperCase() === c.tag.trim().toUpperCase(),
        )
      )
        return "Repetido nesta cria.";
    } catch {
      return "Identificador inválido.";
    }
    if (
      c.weight &&
      !(Number(c.weight.replace(",", ".")) >= 10 && Number(c.weight.replace(",", ".")) <= 80)
    )
      return "Peso ao nascer entre 10 e 80 kg.";
    return null;
  });
  const valid = !dateError && calfErrors.every((e) => !e);

  if (result) {
    return (
      <section>
        <PageHead title="Registrar nascimento" back="/registrar" />
        {result.r.status === "synced" ? (
          <Alert kind="success">Nascimento registrado e sincronizado.</Alert>
        ) : result.r.status === "saved_locally" ? (
          <Alert kind="warning">Salvo no aparelho. Aguardando sincronização.</Alert>
        ) : (
          <Alert kind="danger">Não registrado: {result.r.message}</Alert>
        )}
        <div className="actions">
          {result.calfIds[0] && result.r.status === "synced" ? (
            <Link className="btn btn-primary" to={`/rebanho/${result.calfIds[0]}`}>
              Abrir ficha da cria
            </Link>
          ) : null}
          <button
            className="btn btn-secondary"
            onClick={() => {
              clear();
              setResult(null);
            }}
          >
            Registrar outro nascimento
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <PageHead title="Registrar nascimento" back="/registrar" />
      <Steps current={d.step} />
      {d.step === 1 ? (
        <div className="card">
          <IdentifyAnimal
            animals={animals}
            filter={isDam}
            onSelect={(a) => setD((p) => ({ ...p, damId: a.id, step: 2 }))}
          />
          <p className="hint">
            Mãe não cadastrada? <Link to="/registrar/animal">Faça o cadastro mínimo</Link> antes; o
            Rebania não cria animais por suposição.
          </p>
        </div>
      ) : null}
      {d.step >= 2 && dam ? (
        <SelectedAnimal animal={dam} onChange={() => setD((p) => ({ ...p, step: 1, damId: "" }))} />
      ) : null}
      {d.step === 2 && dam ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) set("step", 3);
          }}
        >
          <div className="grid two">
            <Field
              id="n-date"
              label="Data de nascimento"
              error={dateError}
              icon={<CalendarDays size={22} aria-hidden="true" />}
            >
              <input
                id="n-date"
                type="date"
                max={today}
                value={d.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </Field>
            <Field id="n-assist" label="Intercorrência">
              <select
                id="n-assist"
                value={d.assistance}
                onChange={(e) => set("assistance", e.target.value as Assistance)}
              >
                {ASSISTANCE.map((a) => (
                  <option key={a} value={a}>
                    {ASSISTANCE_LABEL[a]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {d.calves.map((c, i) => (
            <div className="card" key={i}>
              <div className="section-head">
                <h2 style={{ margin: 0 }}>{d.calves.length > 1 ? `Cria ${i + 1}` : "Cria"}</h2>
                {d.calves.length > 1 ? (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remover cria ${i + 1}`}
                    onClick={() =>
                      set(
                        "calves",
                        d.calves.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 size={20} />
                  </button>
                ) : null}
              </div>
              <div className="field">
                <label>Sexo da cria</label>
                <div className="seg">
                  <label>
                    <input
                      type="radio"
                      name={`sex-${i}`}
                      checked={c.sex === "male"}
                      onChange={() => setCalf(i, { sex: "male" })}
                    />{" "}
                    Macho
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`sex-${i}`}
                      checked={c.sex === "female"}
                      onChange={() => setCalf(i, { sex: "female" })}
                    />{" "}
                    Fêmea
                  </label>
                  <label className="check" style={{ border: 0, background: "none" }}>
                    <input
                      type="checkbox"
                      checked={c.stillborn}
                      onChange={(e) => setCalf(i, { stillborn: e.target.checked })}
                    />{" "}
                    Natimorto
                  </label>
                </div>
              </div>
              {!c.stillborn ? (
                <div className="grid two">
                  <Field
                    id={`tag-${i}`}
                    label={c.idType === "visual_tag" ? "Brinco da cria" : "ID provisório"}
                    icon={<Tag size={22} aria-hidden="true" />}
                  >
                    <input
                      id={`tag-${i}`}
                      value={c.tag}
                      onChange={(e) => setCalf(i, { tag: e.target.value })}
                    />
                  </Field>
                  <Field
                    id={`w-${i}`}
                    label="Peso ao nascer (kg)"
                    hint="opcional"
                    icon={<Weight size={22} aria-hidden="true" />}
                  >
                    <input
                      id={`w-${i}`}
                      inputMode="decimal"
                      value={c.weight}
                      onChange={(e) => setCalf(i, { weight: e.target.value })}
                    />
                  </Field>
                </div>
              ) : null}
              {!c.stillborn ? (
                <label className="check" style={{ fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={c.idType === "provisional"}
                    onChange={(e) =>
                      setCalf(i, { idType: e.target.checked ? "provisional" : "visual_tag" })
                    }
                  />
                  Ainda sem brinco (usar ID provisório)
                </label>
              ) : null}
              {calfErrors[i] && (c.sex || c.tag) ? (
                <div className="field-error">{calfErrors[i]}</div>
              ) : null}
            </div>
          ))}
          {d.calves.length < MAX_CALVES_PER_BIRTH ? (
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => set("calves", [...d.calves, emptyCalf()])}
            >
              <Plus size={20} aria-hidden="true" /> Adicionar cria (gêmeos)
            </button>
          ) : null}
          <div className="actions">
            <button className="btn btn-primary btn-lg btn-block" disabled={!valid}>
              Revisar nascimento <ArrowRight size={20} aria-hidden="true" />
            </button>
          </div>
        </form>
      ) : null}
      {d.step === 3 && dam ? (
        <div className="card review">
          <h2>Revise antes de confirmar</h2>
          <dl>
            <dt>Mãe</dt>
            <dd>{dam.primaryIdentifier}</dd>
            <dt>Data</dt>
            <dd>{formatDate(d.date)}</dd>
            <dt>Intercorrência</dt>
            <dd>{ASSISTANCE_LABEL[d.assistance]}</dd>
            {d.calves.map((c, i) => (
              <span key={i} style={{ display: "contents" }}>
                <dt>Cria {i + 1}</dt>
                <dd>
                  {c.sex === "male" ? "Macho" : "Fêmea"} ·{" "}
                  {c.stillborn
                    ? "natimorto"
                    : `${c.idType === "provisional" ? "ID provisório" : "brinco"} ${c.tag}${c.weight ? ` · ${c.weight} kg` : ""}`}
                </dd>
              </span>
            ))}
          </dl>
          <p className="hint">
            Serão criados os cadastros das crias vivas ligados à mãe; a desmama será agendada
            conforme a configuração da fazenda.
          </p>
          <div className="actions">
            <button
              className="btn btn-primary btn-lg"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const id = crypto.randomUUID();
                const calfIds = d.calves.map(() => crypto.randomUUID());
                const payload: BirthInput = {
                  damId: dam.id,
                  date: d.date,
                  assistance: d.assistance,
                  ...(d.notes ? { notes: d.notes } : {}),
                  calves: d.calves.map((c, i) =>
                    c.stillborn
                      ? { sex: c.sex as "male" | "female", stillborn: true }
                      : {
                          id: calfIds[i],
                          sex: c.sex as "male" | "female",
                          identifiers: [{ type: c.idType, value: c.tag }],
                          ...(c.weight ? { weightKg: Number(c.weight.replace(",", ".")) } : {}),
                        },
                  ),
                };
                const r = await engine.submit({
                  ...newMutationBase(id),
                  type: "birth.record",
                  payload,
                });
                setBusy(false);
                setResult({ r, calfIds: calfIds.filter((_, i) => !d.calves[i]!.stillborn) });
              }}
            >
              {busy ? "Registrando…" : "Confirmar nascimento"}
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
