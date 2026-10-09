import type { OccurrenceDto, OccurrenceInput } from "@rebania/contracts";
import {
  OCCURRENCE_SEVERITIES,
  OCCURRENCE_TARGET_LABEL,
  OCCURRENCE_TARGETS,
  SEVERITY_LABEL,
  todayInTimezone,
  type OccurrenceSeverity,
  type OccurrenceTarget,
} from "@rebania/domain";
import { CircleAlert, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { errorMessage, NetworkError, post } from "../../api/client.ts";
import { Alert, Empty, Field, formatDate, Loading, PageHead } from "../../components/ui.tsx";
import { useCachedGet } from "../../state/cached.ts";
import { useLocalHerd } from "../../state/local-data.ts";
import { useSession } from "../../state/session.tsx";

const SEV_BADGE: Record<OccurrenceSeverity, string> = {
  low: "badge-muted",
  medium: "badge-warn",
  high: "badge-danger",
};

/** T42 Ocorrências: animal/lote/pasto/equipamento, descrição, gravidade e resolução. */
export function OccurrencesPage() {
  const { farm, can } = useSession();
  const { animals, places } = useLocalHerd(farm!.id);
  const [params] = useSearchParams();
  const today = todayInTimezone(farm!.timezone);
  const { data, reload, offline } = useCachedGet<{ items: OccurrenceDto[] }>(
    `/v1/farms/${farm!.id}/occurrences`,
    `occ:${farm!.id}`,
  );
  const [adding, setAdding] = useState(params.get("novo") === "1");
  const [f, setF] = useState({
    targetType: (params.get("animal") ? "animal" : "other") as OccurrenceTarget,
    targetId: params.get("animal") ?? "",
    targetLabel: "",
    title: "",
    description: "",
    severity: "medium" as OccurrenceSeverity,
    occurredOn: today,
  });
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  if (!data || !animals)
    return offline && !data ? (
      <Alert kind="info">Ocorrências disponíveis com conexão.</Alert>
    ) : (
      <Loading />
    );
  const options =
    f.targetType === "animal"
      ? animals
          .filter((a) => a.status === "active")
          .map((a) => ({ id: a.id, label: a.primaryIdentifier ?? a.id.slice(0, 8) }))
      : f.targetType === "group" || f.targetType === "pasture"
        ? places.filter((p) => p.kind === f.targetType).map((p) => ({ id: p.id, label: p.name }))
        : [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const body: OccurrenceInput = {
      targetType: f.targetType,
      ...(f.targetId ? { targetId: f.targetId } : {}),
      ...(f.targetLabel.trim() ? { targetLabel: f.targetLabel.trim() } : {}),
      title: f.title.trim(),
      ...(f.description.trim() ? { description: f.description.trim() } : {}),
      severity: f.severity,
      occurredOn: f.occurredOn,
    };
    try {
      await post(`/v1/farms/${farm!.id}/occurrences`, body, { idempotencyKey: key });
      setAdding(false);
      setKey(crypto.randomUUID());
      setF({ ...f, title: "", description: "", targetLabel: "" });
      reload();
    } catch (err) {
      setError(
        err instanceof NetworkError ? "Sem conexão. Tente de novo com sinal." : errorMessage(err),
      );
    }
  }

  const open = data.items.filter((o) => o.status === "open");
  const done = data.items.filter((o) => o.status === "resolved");
  return (
    <section>
      <PageHead
        title="Ocorrências"
        aside={
          can("events.write") && !adding ? (
            <button className="btn btn-soft" onClick={() => setAdding(true)}>
              <Plus size={20} aria-hidden="true" /> Ocorrência
            </button>
          ) : null
        }
      />
      {adding ? (
        <form className="card" onSubmit={submit} style={{ marginBottom: 16 }}>
          {error ? <Alert kind="danger">{error}</Alert> : null}
          <div className="grid two" style={{ gap: 12 }}>
            <Field id="o-type" label="Onde">
              <select
                id="o-type"
                value={f.targetType}
                onChange={(e) =>
                  setF({ ...f, targetType: e.target.value as OccurrenceTarget, targetId: "" })
                }
              >
                {OCCURRENCE_TARGETS.map((t) => (
                  <option key={t} value={t}>
                    {OCCURRENCE_TARGET_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            {options.length ? (
              <Field id="o-target" label={OCCURRENCE_TARGET_LABEL[f.targetType]}>
                <select
                  id="o-target"
                  value={f.targetId}
                  onChange={(e) => setF({ ...f, targetId: e.target.value })}
                >
                  <option value="">Selecione…</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field id="o-label" label="Identificação" hint="opcional">
                <input
                  id="o-label"
                  value={f.targetLabel}
                  onChange={(e) => setF({ ...f, targetLabel: e.target.value })}
                />
              </Field>
            )}
          </div>
          <Field id="o-title" label="O que aconteceu">
            <input
              id="o-title"
              required
              minLength={2}
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
            />
          </Field>
          <Field id="o-desc" label="Detalhes" hint="opcional">
            <textarea
              id="o-desc"
              rows={3}
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </Field>
          <div className="grid two" style={{ gap: 12 }}>
            <Field id="o-sev" label="Gravidade">
              <select
                id="o-sev"
                value={f.severity}
                onChange={(e) => setF({ ...f, severity: e.target.value as OccurrenceSeverity })}
              >
                {OCCURRENCE_SEVERITIES.map((v) => (
                  <option key={v} value={v}>
                    {SEVERITY_LABEL[v]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="o-date" label="Data">
              <input
                id="o-date"
                type="date"
                max={today}
                value={f.occurredOn}
                onChange={(e) => setF({ ...f, occurredOn: e.target.value })}
              />
            </Field>
          </div>
          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={(options.length > 0 && !f.targetId) || !f.title.trim()}
            >
              Registrar ocorrência
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
      {data.items.length === 0 ? (
        <Empty title="Nenhuma ocorrência" icon={<CircleAlert size={40} aria-hidden="true" />} />
      ) : (
        <>
          <h2 style={{ fontSize: 18 }}>Abertas ({open.length})</h2>
          <ul className="list">
            {open.map((o) => (
              <li key={o.id} className="list-item" style={{ display: "block" }}>
                <span className="title">
                  {o.title}{" "}
                  <span className={`badge ${SEV_BADGE[o.severity]}`}>
                    {SEVERITY_LABEL[o.severity]}
                  </span>
                </span>
                <div className="meta">
                  {OCCURRENCE_TARGET_LABEL[o.targetType]}
                  {o.targetLabel ? ` · ${o.targetLabel}` : ""} · {formatDate(o.occurredOn)}
                  {o.authorName ? ` · ${o.authorName}` : ""}
                </div>
                {o.description ? <p style={{ margin: "6px 0 0" }}>{o.description}</p> : null}
                {can("events.write") ? (
                  resolving === o.id ? (
                    <form
                      style={{ marginTop: 8 }}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await post(`/v1/farms/${farm!.id}/occurrences/${o.id}/resolve`, {
                          resolution: resolution.trim(),
                          resolvedOn: today,
                        });
                        setResolving(null);
                        setResolution("");
                        reload();
                      }}
                    >
                      <Field id={`res-${o.id}`} label="Como foi resolvida">
                        <input
                          id={`res-${o.id}`}
                          required
                          minLength={2}
                          value={resolution}
                          onChange={(e) => setResolution(e.target.value)}
                        />
                      </Field>
                      <button className="btn btn-primary">Marcar resolvida</button>
                    </form>
                  ) : (
                    <button
                      className="btn btn-ghost"
                      style={{ marginTop: 6 }}
                      onClick={() => setResolving(o.id)}
                    >
                      Resolver
                    </button>
                  )
                ) : null}
              </li>
            ))}
          </ul>
          {done.length ? (
            <>
              <h2 style={{ fontSize: 18, marginTop: 24 }}>Resolvidas</h2>
              <ul className="list">
                {done.slice(0, 50).map((o) => (
                  <li key={o.id} className="list-item">
                    <span>
                      <span className="title">{o.title}</span>
                      <div className="meta">
                        {formatDate(o.occurredOn)} → {formatDate(o.resolvedOn)} · {o.resolution}
                      </div>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
