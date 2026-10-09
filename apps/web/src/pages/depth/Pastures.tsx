import { todayInTimezone } from "@rebania/domain";
import { CloudRain, Trees } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { errorMessage, patch, post } from "../../api/client.ts";
import { Alert, Empty, Field, formatDate, Loading, PageHead } from "../../components/ui.tsx";
import { useCachedGet } from "../../state/cached.ts";
import { useFeatures } from "../../state/features.ts";
import { useSession } from "../../state/session.tsx";

interface PastureStatus {
  id: string;
  name: string;
  areaHa: number | null;
  restTargetDays: number | null;
  heads: number;
  headsPerHa: number | null;
  occupiedSince: string | null;
  occupiedDays: number | null;
  restingSince: string | null;
  restDays: number | null;
  rain30dMm: number;
}

/** T31 Pastos: ocupação e descanso pelo manejo declarado (não GPS); chuva. */
export function PasturesPage() {
  const { farm, can } = useSession();
  const features = useFeatures(farm!.id);
  const today = todayInTimezone(farm!.timezone);
  const { data, reload } = useCachedGet<{ pastures: PastureStatus[]; rain30dMm: number }>(
    features?.pasture ? `/v1/farms/${farm!.id}/pastures/status` : null,
    `pst:${farm!.id}`,
  );
  const [rain, setRain] = useState({ date: today, mm: "", pastureId: "" });
  const [edit, setEdit] = useState<{ id: string; area: string; rest: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (!features) return <Loading />;
  if (!features.pasture)
    return (
      <Empty title="Pastagem desativada" icon={<Trees size={40} aria-hidden="true" />}>
        <Link to="/fazenda/configuracoes">Ativar em Configurações</Link>
      </Empty>
    );
  if (!data) return <Loading />;
  return (
    <section>
      <PageHead title="Pastagem" back="/fazenda" />
      <p className="hint">
        Ocupação e descanso calculados pelas movimentações registradas (localização declarada, não
        rastreamento). Chuva geral nos últimos 30 dias: {data.rain30dMm.toLocaleString("pt-BR")} mm.
      </p>
      {msg ? <Alert kind="info">{msg}</Alert> : null}
      {data.pastures.length === 0 ? (
        <Empty title="Nenhum pasto cadastrado">
          <Link to="/fazenda/lotes">Cadastrar pastos</Link>
        </Empty>
      ) : (
        <ul className="list">
          {data.pastures.map((p) => {
            const overRest =
              p.restTargetDays !== null && p.restDays !== null && p.restDays >= p.restTargetDays;
            return (
              <li key={p.id} className="list-item" style={{ display: "block" }}>
                <span className="title">
                  {p.name}{" "}
                  {p.heads ? (
                    <span className="badge badge-info">ocupado</span>
                  ) : p.restingSince ? (
                    <span className={`badge ${overRest ? "badge-ok" : "badge-muted"}`}>
                      {overRest ? "descanso cumprido" : "em descanso"}
                    </span>
                  ) : null}
                </span>
                <div className="meta">
                  {p.heads} cab.
                  {p.headsPerHa !== null ? ` (${p.headsPerHa.toLocaleString("pt-BR")} cab/ha)` : ""}
                  {p.areaHa !== null ? ` · ${p.areaHa.toLocaleString("pt-BR")} ha` : ""}
                  {p.occupiedSince
                    ? ` · ocupado desde ${formatDate(p.occupiedSince)} (${p.occupiedDays} dias)`
                    : ""}
                  {p.restingSince
                    ? ` · descanso desde ${formatDate(p.restingSince)} (${p.restDays} dias${p.restTargetDays ? ` de ${p.restTargetDays}` : ""})`
                    : ""}
                  {p.rain30dMm ? ` · chuva 30 d: ${p.rain30dMm} mm` : ""}
                </div>
                {can("groups.manage") ? (
                  edit?.id === p.id ? (
                    <form
                      className="actions"
                      style={{ alignItems: "flex-end" }}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await patch(`/v1/farms/${farm!.id}/pastures/${p.id}/details`, {
                          areaHa: edit.area ? Number(edit.area.replace(",", ".")) : null,
                          restTargetDays: edit.rest ? Number(edit.rest) : null,
                        });
                        setEdit(null);
                        reload();
                      }}
                    >
                      <Field id={`ar-${p.id}`} label="Área (ha)">
                        <input
                          id={`ar-${p.id}`}
                          inputMode="decimal"
                          value={edit.area}
                          onChange={(e) => setEdit({ ...edit, area: e.target.value })}
                        />
                      </Field>
                      <Field id={`rt-${p.id}`} label="Descanso-alvo (dias)">
                        <input
                          id={`rt-${p.id}`}
                          inputMode="numeric"
                          value={edit.rest}
                          onChange={(e) =>
                            setEdit({ ...edit, rest: e.target.value.replace(/\D/g, "") })
                          }
                        />
                      </Field>
                      <button className="btn btn-secondary">Salvar</button>
                    </form>
                  ) : (
                    <button
                      className="btn btn-ghost"
                      onClick={() =>
                        setEdit({
                          id: p.id,
                          area: p.areaHa?.toString() ?? "",
                          rest: p.restTargetDays?.toString() ?? "",
                        })
                      }
                    >
                      Área e descanso
                    </button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {can("events.write") ? (
        <form
          className="card"
          style={{ marginTop: 16 }}
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await post(`/v1/farms/${farm!.id}/rain`, {
                date: rain.date,
                mm: Number(rain.mm.replace(",", ".")),
                ...(rain.pastureId ? { pastureId: rain.pastureId } : {}),
              });
              setMsg("Chuva registrada.");
              setRain({ ...rain, mm: "" });
              reload();
            } catch (err) {
              setMsg(errorMessage(err));
            }
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: 18 }}>
            <CloudRain size={20} aria-hidden="true" /> Registrar chuva
          </h2>
          <div className="grid two" style={{ gap: 12 }}>
            <Field id="rn-date" label="Data">
              <input
                id="rn-date"
                type="date"
                max={today}
                value={rain.date}
                onChange={(e) => setRain({ ...rain, date: e.target.value })}
              />
            </Field>
            <Field id="rn-mm" label="Milímetros">
              <input
                id="rn-mm"
                required
                inputMode="decimal"
                value={rain.mm}
                onChange={(e) => setRain({ ...rain, mm: e.target.value })}
              />
            </Field>
            <Field id="rn-p" label="Local" hint="opcional">
              <select
                id="rn-p"
                value={rain.pastureId}
                onChange={(e) => setRain({ ...rain, pastureId: e.target.value })}
              >
                <option value="">Fazenda (pluviômetro geral)</option>
                {data.pastures.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button className="btn btn-secondary">Registrar</button>
        </form>
      ) : null}
    </section>
  );
}
