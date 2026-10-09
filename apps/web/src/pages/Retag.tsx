import type { Animal } from "@rebania/contracts";
import {
  IDENTIFIER_LABEL,
  IDENTIFIER_TYPES,
  normalizeIdentifier,
  DomainError,
  type IdentifierType,
} from "@rebania/domain";
import { useState } from "react";
import { errorMessage, post } from "../api/client.ts";
import { Alert, Field } from "../components/ui.tsx";
import { putLocalAnimal } from "../offline/engine.ts";
import { useSession } from "../state/session.tsx";

/** T13 Retag: identificar → revisar novo identificador → confirmar. Exige conexão (checa colisões no servidor). */
export function RetagPanel({ animalId, canReplace }: { animalId: string; canReplace: boolean }) {
  const { farm } = useSession();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<IdentifierType>("visual_tag");
  const [value, setValue] = useState("");
  const [replace, setReplace] = useState(false);
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());

  if (!open) {
    return (
      <div className="actions">
        <button className="btn btn-secondary" onClick={() => setOpen(true)}>
          Adicionar ou trocar identificador
        </button>
        {msg ? <Alert kind={msg.kind}>{msg.text}</Alert> : null}
      </div>
    );
  }

  let normalized = "";
  let error: string | null = null;
  try {
    normalized = value ? normalizeIdentifier(type, value) : "";
  } catch (e) {
    error = e instanceof DomainError ? e.message : "Valor inválido.";
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>{review ? "Revisar identificador" : "Novo identificador"}</h3>
      {msg ? <Alert kind={msg.kind}>{msg.text}</Alert> : null}
      {!review ? (
        <>
          <Field id="rt-type" label="Tipo">
            <select
              id="rt-type"
              value={type}
              onChange={(e) => setType(e.target.value as IdentifierType)}
            >
              {IDENTIFIER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {IDENTIFIER_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="rt-value" label="Valor" error={value ? error : null}>
            <input
              id="rt-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={Boolean(value && error)}
            />
          </Field>
          {canReplace ? (
            <div className="field">
              <label style={{ fontWeight: 400, display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  style={{ width: "auto", minHeight: 0 }}
                  checked={replace}
                  onChange={(e) => setReplace(e.target.checked)}
                />
                Substituir o {IDENTIFIER_LABEL[type].toLowerCase()} atual (o antigo fica no
                histórico)
              </label>
            </div>
          ) : null}
          {replace ? (
            <Field id="rt-reason" label="Motivo" hint="ex.: brinco perdido">
              <input id="rt-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          ) : null}
          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={!value || Boolean(error)}
              onClick={() => setReview(true)}
            >
              Revisar
            </button>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="review">
            <dl>
              <dt>Tipo</dt>
              <dd>{IDENTIFIER_LABEL[type]}</dd>
              <dt>Valor</dt>
              <dd>{normalized}</dd>
              <dt>Ação</dt>
              <dd>{replace ? "Substituir o atual (preservado no histórico)" : "Adicionar"}</dd>
            </dl>
          </div>
          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const a = await post<Animal>(
                    `/v1/farms/${farm!.id}/animals/${animalId}/identifiers`,
                    {
                      type,
                      value,
                      replaceActiveOfSameType: replace,
                      ...(reason ? { reason } : {}),
                    },
                    { idempotencyKey: key },
                  );
                  await putLocalAnimal(a);
                  setMsg({ kind: "success", text: "Identificador registrado e sincronizado." });
                  setOpen(false);
                  setReview(false);
                  setValue("");
                  setKey(crypto.randomUUID());
                } catch (e) {
                  setMsg({ kind: "danger", text: errorMessage(e) });
                  setReview(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirmar
            </button>
            <button className="btn btn-ghost" onClick={() => setReview(false)}>
              Editar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
