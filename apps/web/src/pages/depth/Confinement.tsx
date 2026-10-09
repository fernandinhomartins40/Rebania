import { formatBRL, formatQuantity, todayInTimezone } from "@rebania/domain";
import { Warehouse } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { errorMessage, patch, post } from "../../api/client.ts";
import { Alert, Empty, Field, formatDate, Loading, PageHead } from "../../components/ui.tsx";
import { useCachedGet } from "../../state/cached.ts";
import { useFeatures } from "../../state/features.ts";
import { useLocalHerd } from "../../state/local-data.ts";
import { useSession } from "../../state/session.tsx";

interface Pen {
  id: string;
  name: string;
  heads: number;
  capacity: number | null;
  startedOn: string | null;
  daysOnFeed: number | null;
  lastReadings: { date: string; score: number; notes: string | null }[];
  feed7d: number;
  feedUnit: string | null;
  feedCost7dCents: number | null;
}

/** T34 Confinamento: baias, leitura de cocho e trato; fechamento nos Relatórios. */
export function ConfinementPage() {
  const { farm, can } = useSession();
  const features = useFeatures(farm!.id);
  const { places } = useLocalHerd(farm!.id);
  const today = todayInTimezone(farm!.timezone);
  const { data, reload } = useCachedGet<{ pens: Pen[] }>(
    features?.confinement ? `/v1/farms/${farm!.id}/confinement` : null,
    `conf:${farm!.id}`,
  );
  const [score, setScore] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [penForm, setPenForm] = useState({ groupId: "", capacity: "", startedOn: today });
  if (!features) return <Loading />;
  if (!features.confinement)
    return (
      <Empty title="Confinamento desativado" icon={<Warehouse size={40} aria-hidden="true" />}>
        <Link to="/fazenda/configuracoes">Ativar em Configurações</Link>
      </Empty>
    );
  if (!data) return <Loading />;
  const groups = places.filter((p) => p.kind === "group" && !data.pens.some((x) => x.id === p.id));
  return (
    <section>
      <PageHead title="Confinamento" back="/fazenda" />
      {msg ? <Alert kind="info">{msg}</Alert> : null}
      {data.pens.length === 0 ? <Empty title="Nenhuma baia" /> : null}
      <div className="grid two">
        {data.pens.map((p) => (
          <div key={p.id} className="card">
            <h2 style={{ marginTop: 0 }}>{p.name}</h2>
            <p className="hint">
              {p.heads} cab.{p.capacity ? ` de ${p.capacity}` : ""}
              {p.daysOnFeed !== null
                ? ` · ${p.daysOnFeed} dias de cocho (desde ${formatDate(p.startedOn)})`
                : ""}
            </p>
            <p className="hint">
              Trato 7 dias: {p.feedUnit ? formatQuantity(p.feed7d, p.feedUnit) : "—"}
              {p.feedCost7dCents !== null ? ` · ${formatBRL(p.feedCost7dCents)}` : ""}
            </p>
            <p className="hint">
              Leituras de cocho:{" "}
              {p.lastReadings.length
                ? p.lastReadings
                    .map((r) => `${formatDate(r.date).slice(0, 5)}: ${r.score}`)
                    .join(" · ")
                : "nenhuma"}
            </p>
            {can("events.write") ? (
              <form
                className="actions"
                style={{ marginTop: 0, alignItems: "flex-end" }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await post(`/v1/farms/${farm!.id}/bunk-readings`, {
                      groupId: p.id,
                      date: today,
                      score: Number(score[p.id]),
                    });
                    setMsg(`Leitura de ${p.name} registrada.`);
                    reload();
                  } catch (err) {
                    setMsg(errorMessage(err));
                  }
                }}
              >
                <Field id={`bk-${p.id}`} label="Escore de cocho hoje (0–5)">
                  <select
                    id={`bk-${p.id}`}
                    value={score[p.id] ?? ""}
                    onChange={(e) => setScore({ ...score, [p.id]: e.target.value })}
                    required
                  >
                    <option value="">—</option>
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </Field>
                <button className="btn btn-secondary">Registrar leitura</button>
                <Link className="btn btn-ghost" to="/registrar/trato">
                  Trato
                </Link>
              </form>
            ) : null}
          </div>
        ))}
      </div>
      <p className="hint">
        A escala do escore é a adotada pela fazenda; o Rebania não ajusta o trato automaticamente.
      </p>
      {can("groups.manage") && groups.length ? (
        <form
          className="card"
          onSubmit={async (e) => {
            e.preventDefault();
            await patch(`/v1/farms/${farm!.id}/groups/${penForm.groupId}/pen`, {
              isPen: true,
              penCapacity: penForm.capacity ? Number(penForm.capacity) : null,
              penStartedOn: penForm.startedOn,
            });
            reload();
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Transformar lote em baia</h2>
          <div className="grid two" style={{ gap: 12 }}>
            <Field id="pen-g" label="Lote">
              <select
                id="pen-g"
                required
                value={penForm.groupId}
                onChange={(e) => setPenForm({ ...penForm, groupId: e.target.value })}
              >
                <option value="">Selecione…</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="pen-c" label="Capacidade (cab.)" hint="opcional">
              <input
                id="pen-c"
                inputMode="numeric"
                value={penForm.capacity}
                onChange={(e) =>
                  setPenForm({ ...penForm, capacity: e.target.value.replace(/\D/g, "") })
                }
              />
            </Field>
            <Field id="pen-s" label="Entrada no cocho">
              <input
                id="pen-s"
                type="date"
                max={today}
                value={penForm.startedOn}
                onChange={(e) => setPenForm({ ...penForm, startedOn: e.target.value })}
              />
            </Field>
          </div>
          <button className="btn btn-secondary">Salvar baia</button>
        </form>
      ) : null}
      <Link className="btn btn-ghost" to="/relatorios?r=confinement">
        Fechamento do confinamento
      </Link>
    </section>
  );
}
