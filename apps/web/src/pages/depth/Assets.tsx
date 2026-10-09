import {
  ASSET_KIND_LABEL,
  ASSET_KINDS,
  formatBRL,
  todayInTimezone,
  type AssetKind,
} from "@rebania/domain";
import { Plus, Tractor } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { errorMessage, post } from "../../api/client.ts";
import { Alert, Empty, Field, formatDate, Loading, PageHead } from "../../components/ui.tsx";
import { useCachedGet } from "../../state/cached.ts";
import { useFeatures } from "../../state/features.ts";
import { useSession } from "../../state/session.tsx";

interface AssetDto {
  id: string;
  name: string;
  kind: AssetKind;
  identifier: string | null;
  maintenances: {
    id: string;
    date: string;
    description: string;
    costCents: number | null;
    nextDueOn: string | null;
  }[];
}

/** T43 Patrimônio: máquinas, veículos e instalações com manutenção (próxima vira tarefa). */
export function AssetsPage() {
  const { farm, can } = useSession();
  const features = useFeatures(farm!.id);
  const today = todayInTimezone(farm!.timezone);
  const { data, reload } = useCachedGet<{ items: AssetDto[] }>(
    features?.assets ? `/v1/farms/${farm!.id}/assets` : null,
    `assets:${farm!.id}`,
  );
  const [adding, setAdding] = useState(false);
  const [a, setA] = useState({ name: "", kind: "machine" as AssetKind, identifier: "" });
  const [m, setM] = useState<{
    id: string;
    date: string;
    description: string;
    cost: string;
    next: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!features) return <Loading />;
  if (!features.assets)
    return (
      <Empty title="Patrimônio desativado" icon={<Tractor size={40} aria-hidden="true" />}>
        <Link to="/fazenda/configuracoes">Ativar em Configurações</Link>
      </Empty>
    );
  if (!data) return <Loading />;
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <section>
      <PageHead
        title="Patrimônio"
        back="/fazenda"
        aside={
          can("groups.manage") && !adding ? (
            <button className="btn btn-soft" onClick={() => setAdding(true)}>
              <Plus size={20} aria-hidden="true" /> Bem
            </button>
          ) : null
        }
      />
      {error ? <Alert kind="danger">{error}</Alert> : null}
      {adding ? (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await post(`/v1/farms/${farm!.id}/assets`, {
                name: a.name,
                kind: a.kind,
                ...(a.identifier ? { identifier: a.identifier } : {}),
              });
              setAdding(false);
              setA({ name: "", kind: "machine", identifier: "" });
            });
          }}
        >
          <div className="grid two" style={{ gap: 12 }}>
            <Field id="as-n" label="Nome">
              <input
                id="as-n"
                required
                minLength={2}
                value={a.name}
                onChange={(e) => setA({ ...a, name: e.target.value })}
              />
            </Field>
            <Field id="as-k" label="Tipo">
              <select
                id="as-k"
                value={a.kind}
                onChange={(e) => setA({ ...a, kind: e.target.value as AssetKind })}
              >
                {ASSET_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ASSET_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="as-i" label="Placa / série" hint="opcional">
              <input
                id="as-i"
                value={a.identifier}
                onChange={(e) => setA({ ...a, identifier: e.target.value })}
              />
            </Field>
          </div>
          <div className="actions">
            <button className="btn btn-primary">Salvar</button>
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
      {data.items.length === 0 ? (
        <Empty title="Nenhum bem cadastrado" />
      ) : (
        <ul className="list">
          {data.items.map((x) => (
            <li key={x.id} className="list-item" style={{ display: "block" }}>
              <span className="title">
                {x.name} <span className="badge badge-muted">{ASSET_KIND_LABEL[x.kind]}</span>
              </span>
              {x.identifier ? <div className="meta">{x.identifier}</div> : null}
              {x.maintenances.map((mm) => (
                <div key={mm.id} className="meta">
                  {formatDate(mm.date)} · {mm.description}
                  {mm.costCents !== null ? ` · ${formatBRL(mm.costCents)}` : ""}
                  {mm.nextDueOn ? ` · próxima ${formatDate(mm.nextDueOn)}` : ""}
                </div>
              ))}
              {can("events.write") ? (
                m?.id === x.id ? (
                  <form
                    style={{ marginTop: 8 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await post(`/v1/farms/${farm!.id}/assets/${x.id}/maintenance`, {
                          date: m.date,
                          description: m.description,
                          ...(m.cost ? { cost: Number(m.cost.replace(",", ".")) } : {}),
                          ...(m.next ? { nextDueOn: m.next } : {}),
                        });
                        setM(null);
                      });
                    }}
                  >
                    <div className="grid two" style={{ gap: 12 }}>
                      <Field id={`md-${x.id}`} label="Data">
                        <input
                          id={`md-${x.id}`}
                          type="date"
                          max={today}
                          value={m.date}
                          onChange={(e) => setM({ ...m, date: e.target.value })}
                        />
                      </Field>
                      <Field id={`mde-${x.id}`} label="Serviço">
                        <input
                          id={`mde-${x.id}`}
                          required
                          value={m.description}
                          onChange={(e) => setM({ ...m, description: e.target.value })}
                        />
                      </Field>
                      <Field id={`mc-${x.id}`} label="Custo (R$)" hint="opcional">
                        <input
                          id={`mc-${x.id}`}
                          inputMode="decimal"
                          value={m.cost}
                          onChange={(e) => setM({ ...m, cost: e.target.value })}
                        />
                      </Field>
                      <Field id={`mn-${x.id}`} label="Próxima manutenção" hint="vira tarefa">
                        <input
                          id={`mn-${x.id}`}
                          type="date"
                          min={today}
                          value={m.next}
                          onChange={(e) => setM({ ...m, next: e.target.value })}
                        />
                      </Field>
                    </div>
                    <button className="btn btn-secondary">Registrar manutenção</button>
                  </form>
                ) : (
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      setM({ id: x.id, date: today, description: "", cost: "", next: "" })
                    }
                  >
                    Manutenção
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
