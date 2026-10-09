import type { CommercialDto } from "@rebania/contracts";
import { formatBRL, realCarcass, todayInTimezone } from "@rebania/domain";
import { useEffect, useState } from "react";
import { errorMessage, get, post } from "../../api/client.ts";
import { Alert, Field, formatDate } from "../../components/ui.tsx";
import { useSession } from "../../state/session.tsx";

interface Saved {
  receivedOn: string;
  plant: string;
  finalTotalCents: number | null;
  items: {
    animalId: string;
    carcassKg: number;
    arrobas: number;
    yieldPercent: number | null;
    grade: string | null;
  }[];
}

/** T36 Retorno do frigorífico: carcaça real × estimativa da venda. */
export function SlaughterReturnPanel({ sale }: { sale: CommercialDto }) {
  const { farm, can } = useSession();
  const today = todayInTimezone(farm!.timezone);
  const [saved, setSaved] = useState<Saved | null | undefined>(undefined);
  const [form, setForm] = useState({
    receivedOn: today,
    plant: sale.counterparty,
    finalTotal: "",
    carcass: {} as Record<string, string>,
  });
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    get<{ return: Saved | null }>(
      `/v1/farms/${farm!.id}/commercial/${sale.id}/slaughter-return`,
    ).then(
      (r) => setSaved(r.return),
      () => setSaved(null),
    );
  }, [farm, sale.id, tick]);
  if (saved === undefined) return null;
  const tag = (id: string) => sale.items.find((i) => i.animalId === id)?.tag ?? id.slice(0, 8);
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Retorno do frigorífico</h2>
      {saved ? (
        <>
          <p className="hint">
            {saved.plant} · {formatDate(saved.receivedOn)}
            {saved.finalTotalCents !== null
              ? ` · valor final ${formatBRL(saved.finalTotalCents)}`
              : ""}
          </p>
          <table className="data">
            <thead>
              <tr>
                <th>Brinco</th>
                <th>Carcaça</th>
                <th>@ reais</th>
                <th>Rendimento</th>
              </tr>
            </thead>
            <tbody>
              {saved.items.map((i) => (
                <tr key={i.animalId} style={{ cursor: "default" }}>
                  <td>{tag(i.animalId)}</td>
                  <td>{i.carcassKg.toLocaleString("pt-BR")} kg</td>
                  <td>{i.arrobas.toLocaleString("pt-BR")}</td>
                  <td>
                    {i.yieldPercent !== null ? `${i.yieldPercent.toLocaleString("pt-BR")}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sale.estimatedArrobas ? (
            <p className="hint">
              Estimado na venda: {sale.estimatedArrobas.toLocaleString("pt-BR")} @ · real:{" "}
              {saved.items
                .reduce((s, i) => s + i.arrobas, 0)
                .toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
              @
            </p>
          ) : null}
        </>
      ) : can("sales.manage") && !sale.voided ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await post(`/v1/farms/${farm!.id}/commercial/${sale.id}/slaughter-return`, {
                receivedOn: form.receivedOn,
                plant: form.plant,
                items: sale.items.map((i) => ({
                  animalId: i.animalId,
                  carcassKg: Number((form.carcass[i.animalId] ?? "").replace(",", ".")),
                })),
                ...(form.finalTotal
                  ? { finalTotal: Number(form.finalTotal.replace(",", ".")) }
                  : {}),
              });
              setTick((n) => n + 1);
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          {error ? <Alert kind="danger">{error}</Alert> : null}
          <div className="grid two" style={{ gap: 12 }}>
            <Field id="sr-plant" label="Frigorífico">
              <input
                id="sr-plant"
                required
                value={form.plant}
                onChange={(e) => setForm({ ...form, plant: e.target.value })}
              />
            </Field>
            <Field id="sr-date" label="Data do retorno">
              <input
                id="sr-date"
                type="date"
                max={today}
                value={form.receivedOn}
                onChange={(e) => setForm({ ...form, receivedOn: e.target.value })}
              />
            </Field>
          </div>
          <ul className="list">
            {sale.items.map((i) => {
              const v = Number((form.carcass[i.animalId] ?? "").replace(",", "."));
              let preview = "";
              try {
                if (v > 0) {
                  const r = realCarcass(i.liveWeightKg, v);
                  preview = `${r.arrobas} @${r.yieldPercent !== null ? ` · ${r.yieldPercent}%` : ""}`;
                }
              } catch {
                preview = "valor inválido";
              }
              return (
                <li key={i.animalId} className="list-item">
                  <span className="title">{i.tag ?? "Animal"}</span>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      aria-label={`Carcaça de ${i.tag ?? "animal"} (kg)`}
                      required
                      inputMode="decimal"
                      style={{ maxWidth: 120 }}
                      value={form.carcass[i.animalId] ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          carcass: { ...form.carcass, [i.animalId]: e.target.value },
                        })
                      }
                    />
                    <span className="hint">{preview}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <Field id="sr-total" label="Valor final pago (R$)" hint="opcional">
            <input
              id="sr-total"
              inputMode="decimal"
              value={form.finalTotal}
              onChange={(e) => setForm({ ...form, finalTotal: e.target.value })}
            />
          </Field>
          <button className="btn btn-secondary">Salvar retorno</button>
        </form>
      ) : (
        <p className="hint">Sem retorno registrado.</p>
      )}
    </div>
  );
}
