import { ArrowRight, CalendarDays, ScanBarcode, Tag } from "lucide-react";
import type { CreateAnimalInput } from "@rebania/contracts";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  CATEGORY_SEX,
  DomainError,
  IDENTIFIER_LABEL,
  isCivilDate,
  normalizeIdentifier,
  SEX_LABEL,
  todayInTimezone,
  daysBetween,
  type Category,
  type IdentifierType,
  type Origin,
} from "@rebania/domain";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Field, Steps, formatDate, PageHead } from "../components/ui.tsx";
import { newMutationBase, putLocalAnimal, type LocalAnimal, type SubmitResult } from "../offline/engine.ts";
import { useDraft } from "../state/draft.ts";
import { useLocalHerd } from "../state/local-data.ts";
import { useSession } from "../state/session.tsx";
import { useSync } from "../state/sync.tsx";
import { SubmitOutcome } from "./flow.tsx";

interface Draft {
  step: 1 | 2 | 3;
  idType: IdentifierType;
  idValue: string;
  rfid: string;
  category: Category | "";
  breed: string;
  birthDate: string;
  birthDateEstimated: boolean;
  origin: Origin;
  entryDate: string;
  groupId: string;
  notes: string;
}

const EMPTY: Draft = {
  step: 1,
  idType: "visual_tag",
  idValue: "",
  rfid: "",
  category: "",
  breed: "",
  birthDate: "",
  birthDateEstimated: false,
  origin: "purchased",
  entryDate: "",
  groupId: "",
  notes: "",
};

const ORIGINS: { v: Origin; l: string }[] = [
  { v: "purchased", l: "Comprado" },
  { v: "born_on_farm", l: "Nascido na fazenda" },
  { v: "transferred_in", l: "Transferido" },
  { v: "unknown", l: "Desconhecida" },
];

/** T10 Cadastro mínimo em três etapas; completar depois sem impedir tarefa válida. */
export function NewAnimalPage() {
  const { farm } = useSession();
  const { engine } = useSync();
  const { animals, places } = useLocalHerd(farm!.id);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [d, setD, clear] = useDraft<Draft>(`new-animal:${farm!.id}`, { ...EMPTY, idValue: params.get("tag") ?? "" });
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = todayInTimezone(farm!.timezone);
  const groups = places.filter((p) => p.kind === "group");
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  // ---- validações locais (o servidor revalida tudo) ----
  const idError = (() => {
    if (!d.idValue.trim()) return "Informe o brinco ou um ID provisório.";
    try {
      const n = normalizeIdentifier(d.idType, d.idValue);
      const clash = animals?.find((a) => a.identifiers.some((i) => i.status === "active" && i.type === d.idType && i.value === n));
      return clash ? `Já usado pelo animal ${clash.primaryIdentifier}.` : null;
    } catch (e) {
      return e instanceof DomainError ? e.message : "Inválido.";
    }
  })();
  const rfidError = (() => {
    if (!d.rfid.trim()) return null;
    try {
      normalizeIdentifier("rfid", d.rfid);
      return null;
    } catch (e) {
      return e instanceof DomainError ? e.message : "Inválido.";
    }
  })();
  const dateError = (v: string, label: string) =>
    !v ? null : !isCivilDate(v) ? `${label} inválida.` : daysBetween(today, v) > 0 ? `${label} no futuro.` : null;
  const birthError = dateError(d.birthDate, "Data de nascimento");
  const entryError =
    dateError(d.entryDate, "Data de entrada") ??
    (d.entryDate && d.birthDate && daysBetween(d.birthDate, d.entryDate) < 0 ? "Entrada antes do nascimento." : null);
  const step2Valid = d.category !== "" && !birthError && !entryError;

  if (result) {
    return (
      <section>
        <PageHead title="Cadastrar animal" back="/registrar" />
        <SubmitOutcome
          result={result}
          successText="Animal cadastrado"
          restart={{ label: "Cadastrar outro animal", onClick: () => { setResult(null); setCreatedId(null); } }}
          next={[
            ...(createdId && result.status !== "rejected" ? [{ to: `/rebanho/${createdId}`, label: "Abrir passaporte" }] : []),
          ]}
        />
      </section>
    );
  }

  return (
    <section>
      <PageHead title="Cadastrar animal" back="/registrar" />
      <Steps current={d.step} />

      {d.step === 1 ? (
        <form className="card" onSubmit={(e) => { e.preventDefault(); if (!idError && !rfidError) set("step", 2); }}>
          <Field id="id-type" label="Tipo de identificação">
            <select id="id-type" value={d.idType} onChange={(e) => set("idType", e.target.value as IdentifierType)}>
              {(["visual_tag", "provisional"] as const).map((t) => <option key={t} value={t}>{IDENTIFIER_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field id="id-value" label={d.idType === "visual_tag" ? "Número do brinco" : "ID provisório"} error={d.idValue ? idError : null} icon={<Tag size={22} aria-hidden="true" />}>
            <input id="id-value" autoFocus value={d.idValue} onChange={(e) => set("idValue", e.target.value)} aria-invalid={Boolean(d.idValue && idError)} />
          </Field>
          <Field id="rfid" label="RFID (ISO 11784)" hint="opcional, 15 dígitos" error={rfidError} icon={<ScanBarcode size={22} aria-hidden="true" />}>
            <input id="rfid" inputMode="numeric" value={d.rfid} onChange={(e) => set("rfid", e.target.value)} aria-invalid={Boolean(rfidError)} />
          </Field>
          <div className="actions">
            <button className="btn btn-primary btn-lg" disabled={Boolean(idError || rfidError)}>Continuar <ArrowRight size={20} aria-hidden="true" /></button>
            <button type="button" className="btn btn-ghost" onClick={() => { clear(); navigate("/registrar"); }}>Cancelar</button>
          </div>
        </form>
      ) : null}

      {d.step === 2 ? (
        <form className="card" onSubmit={(e) => { e.preventDefault(); if (step2Valid) set("step", 3); }}>
          <Field id="category" label="Categoria">
            <select id="category" value={d.category} onChange={(e) => set("category", e.target.value as Category)} required>
              <option value="">Selecione…</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]} ({SEX_LABEL[CATEGORY_SEX[c]].toLowerCase()})</option>)}
            </select>
          </Field>
          <Field id="origin" label="Origem">
            <div className="seg" role="radiogroup" aria-label="Origem">
              {ORIGINS.map((o) => (
                <label key={o.v}>
                  <input type="radio" name="origin" checked={d.origin === o.v} onChange={() => set("origin", o.v)} /> {o.l}
                </label>
              ))}
            </div>
          </Field>
          <div className="grid two">
            <Field id="birth" label="Nascimento" hint="opcional" error={birthError} icon={<CalendarDays size={22} aria-hidden="true" />}>
              <input id="birth" type="date" max={today} value={d.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
            </Field>
            <Field id="entry" label="Entrada na fazenda" hint="opcional" error={entryError} icon={<CalendarDays size={22} aria-hidden="true" />}>
              <input id="entry" type="date" max={today} value={d.entryDate} onChange={(e) => set("entryDate", e.target.value)} />
            </Field>
          </div>
          {d.birthDate ? (
            <div className="field">
              <label style={{ fontWeight: 400, display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" style={{ width: "auto", minHeight: 0 }} checked={d.birthDateEstimated} onChange={(e) => set("birthDateEstimated", e.target.checked)} />
                Data de nascimento estimada
              </label>
            </div>
          ) : null}
          <div className="grid two">
            <Field id="breed" label="Raça" hint="opcional">
              <input id="breed" value={d.breed} onChange={(e) => set("breed", e.target.value)} />
            </Field>
            <Field id="group" label="Lote" hint="opcional">
              <select id="group" value={d.groupId} onChange={(e) => set("groupId", e.target.value)}>
                <option value="">Sem lote</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
          </div>
          <Field id="notes" label="Observações" hint="opcional">
            <textarea id="notes" rows={2} value={d.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
          <div className="actions">
            <button className="btn btn-primary btn-lg" disabled={!step2Valid}>Revisar cadastro <ArrowRight size={20} aria-hidden="true" /></button>
            <button type="button" className="btn btn-ghost" onClick={() => set("step", 1)}>Voltar</button>
          </div>
        </form>
      ) : null}

      {d.step === 3 && d.category ? (
        <div className="card review">
          <h2>Revise antes de confirmar</h2>
          <dl>
            <dt>{IDENTIFIER_LABEL[d.idType]}</dt><dd>{normalizeIdentifier(d.idType, d.idValue)}</dd>
            {d.rfid ? (<><dt>RFID</dt><dd>{normalizeIdentifier("rfid", d.rfid)}</dd></>) : null}
            <dt>Categoria</dt><dd>{CATEGORY_LABEL[d.category]} · {SEX_LABEL[CATEGORY_SEX[d.category]]}</dd>
            <dt>Origem</dt><dd>{ORIGINS.find((o) => o.v === d.origin)?.l}</dd>
            <dt>Nascimento</dt><dd>{formatDate(d.birthDate)}{d.birthDateEstimated ? " (estimada)" : ""}</dd>
            <dt>Entrada</dt><dd>{formatDate(d.entryDate)}</dd>
            <dt>Raça</dt><dd>{d.breed || "—"}</dd>
            <dt>Lote</dt><dd>{groups.find((g) => g.id === d.groupId)?.name ?? "Sem lote"}</dd>
          </dl>
          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                if (!d.category) return;
                setBusy(true);
                const id = crypto.randomUUID();
                const payload: CreateAnimalInput = {
                  sex: CATEGORY_SEX[d.category],
                  category: d.category,
                  origin: d.origin,
                  birthDateEstimated: d.birthDateEstimated,
                  identifiers: [
                    { type: d.idType, value: d.idValue },
                    ...(d.rfid ? [{ type: "rfid" as const, value: d.rfid }] : []),
                  ],
                  ...(d.breed ? { breed: d.breed } : {}),
                  ...(d.birthDate ? { birthDate: d.birthDate } : {}),
                  ...(d.entryDate ? { entryDate: d.entryDate } : {}),
                  ...(d.groupId ? { groupId: d.groupId } : {}),
                  ...(d.notes ? { notes: d.notes } : {}),
                };
                const group = groups.find((g) => g.id === d.groupId);
                const optimistic: LocalAnimal = {
                  id, farmId: farm!.id, sex: payload.sex, category: d.category, status: "active",
                  breed: d.breed || null, birthDate: d.birthDate || null, birthDateEstimated: d.birthDateEstimated,
                  origin: d.origin, entryDate: d.entryDate || null, groupId: d.groupId || null, groupName: group?.name ?? null,
                  pastureId: null, pastureName: null, damId: null, sireId: null, notes: d.notes || null, version: 1,
                  identifiers: payload.identifiers.map((i) => ({
                    id: crypto.randomUUID(), type: i.type, value: normalizeIdentifier(i.type, i.value),
                    display: normalizeIdentifier(i.type, i.value), status: "active", createdAt: new Date().toISOString(), retiredAt: null,
                  })),
                  primaryIdentifier: normalizeIdentifier(d.idType, d.idValue), lastWeight: null,
                  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), pending: true,
                };
                const r = await engine.submit({ ...newMutationBase(id), type: "animal.create", payload }, () => putLocalAnimal(optimistic));
                setBusy(false);
                setCreatedId(id);
                setResult(r);
                if (r.status !== "rejected") clear();
              }}
            >
              {busy ? "Registrando…" : "Confirmar cadastro"}
            </button>
            <button className="btn btn-ghost" onClick={() => set("step", 2)}>Editar</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
