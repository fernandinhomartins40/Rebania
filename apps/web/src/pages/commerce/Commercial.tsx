import type { CommercialDto } from "@rebania/contracts";
import { formatBRL, PRICE_MODE_LABEL } from "@rebania/domain";
import { ChevronRight, HandCoins, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { errorMessage, get, post } from "../../api/client.ts";
import { Alert, Empty, formatDate, Loading, PageHead } from "../../components/ui.tsx";
import { useSession } from "../../state/session.tsx";
import { useFeatures } from "../../state/features.ts";
import { SlaughterReturnPanel } from "../depth/Slaughter.tsx";

/** Lista de compras e vendas. */
export function CommercialPage() {
  const { farm, can } = useSession();
  const [items, setItems] = useState<CommercialDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    get<{ items: CommercialDto[] }>(`/v1/farms/${farm!.id}/commercial`).then(
      (r) => setItems(r.items),
      () => setFailed(true),
    );
  }, [farm]);
  if (failed) return <Alert kind="info">Compras e vendas disponíveis com conexão.</Alert>;
  if (!items) return <Loading />;
  return (
    <section>
      <PageHead title="Compra e venda" back="/fazenda" />
      {can("sales.manage") ? (
        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="btn btn-primary" to="/comercial/venda">
            <HandCoins size={20} aria-hidden="true" /> Nova venda
          </Link>
          <Link className="btn btn-secondary" to="/comercial/compra">
            <ShoppingCart size={20} aria-hidden="true" /> Nova compra
          </Link>
        </div>
      ) : null}
      {items.length === 0 ? (
        <Empty title="Nenhuma compra ou venda registrada" />
      ) : (
        <ul className="list">
          {items.map((t) => (
            <li key={t.id}>
              <Link
                className="list-item"
                to={`/comercial/${t.id}`}
                style={{ opacity: t.voided ? 0.55 : 1 }}
              >
                <span>
                  <span className="title">
                    {t.kind === "sale" ? "Venda" : "Compra"} · {t.counterparty}
                    {t.voided ? <span className="badge badge-muted">anulada</span> : null}
                    {t.withdrawalOverride ? (
                      <span className="badge badge-warn">exceção de carência</span>
                    ) : null}
                  </span>
                  <div className="meta">
                    {formatDate(t.date)} · {t.heads} cabeça(s) · {formatBRL(t.totalCents)}
                  </div>
                </span>
                <ChevronRight size={20} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CommercialDetailPage() {
  const { id } = useParams();
  const { farm, can } = useSession();
  const features = useFeatures(farm!.id);
  const [t, setT] = useState<CommercialDto | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    get<CommercialDto>(`/v1/farms/${farm!.id}/commercial/${id}`).then(setT, (e) =>
      setError(errorMessage(e)),
    );
  }, [farm, id, tick]);
  if (error && !t) return <Alert kind="danger">{error}</Alert>;
  if (!t) return <Loading />;
  return (
    <section>
      <PageHead
        title={`${t.kind === "sale" ? "Venda" : "Compra"} · ${t.counterparty}`}
        back="/comercial"
      />
      {t.voided ? (
        <Alert kind="warning">Transação anulada. O histórico foi preservado.</Alert>
      ) : null}
      <div className="card review">
        <dl>
          <dt>Data</dt>
          <dd>{formatDate(t.date)}</dd>
          <dt>Preço</dt>
          <dd>{PRICE_MODE_LABEL[t.priceMode]}</dd>
          <dt>Cálculo</dt>
          <dd>{t.formula}</dd>
          <dt>Total</dt>
          <dd>
            <strong>{formatBRL(t.totalCents)}</strong>
          </dd>
          {t.totalLiveKg ? (
            <>
              <dt>Peso vivo</dt>
              <dd>
                {t.totalLiveKg.toLocaleString("pt-BR")} kg ·{" "}
                {formatBRL(Math.round(t.totalCents / t.totalLiveKg))}/kg
              </dd>
            </>
          ) : null}
          {t.estimatedArrobas ? (
            <>
              <dt>Arrobas</dt>
              <dd>
                {t.estimatedArrobas.toLocaleString("pt-BR")} @ (estimativa com{" "}
                {t.carcassYieldPercent}% de rendimento)
              </dd>
            </>
          ) : null}
          {t.document ? (
            <>
              <dt>Documento</dt>
              <dd>{t.document}</dd>
            </>
          ) : null}
          {t.withdrawalOverride ? (
            <>
              <dt>Exceção de carência</dt>
              <dd>
                {t.withdrawalOverride.reason} — {t.withdrawalOverride.byName ?? "proprietário"}
              </dd>
            </>
          ) : null}
        </dl>
        <h3 style={{ margin: "12px 0 6px" }}>Animais ({t.heads})</h3>
        <table className="data">
          <thead>
            <tr>
              <th>Brinco</th>
              <th>Peso vivo</th>
              <th>Rateio</th>
            </tr>
          </thead>
          <tbody>
            {t.items.map((i) => (
              <tr key={i.animalId} style={{ cursor: "default" }}>
                <td>
                  <Link to={`/rebanho/${i.animalId}`}>{i.tag ?? "—"}</Link>
                </td>
                <td>{i.liveWeightKg ? `${i.liveWeightKg.toLocaleString("pt-BR")} kg` : "—"}</td>
                <td>{formatBRL(i.allocatedCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!t.voided && can("sales.manage") ? (
          voiding ? (
            <form
              style={{ marginTop: 12 }}
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                try {
                  await post(`/v1/farms/${farm!.id}/commercial/${t.id}/void`, {
                    reason: reason.trim(),
                  });
                  setVoiding(false);
                  setTick((n) => n + 1);
                } catch (err) {
                  setError(errorMessage(err));
                }
              }}
            >
              {error ? <Alert kind="danger">{error}</Alert> : null}
              <div className="field">
                <label htmlFor="v-reason">Motivo da anulação</label>
                <input
                  id="v-reason"
                  required
                  minLength={5}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <div className="actions" style={{ marginTop: 0 }}>
                <button className="btn btn-secondary">Anular transação</button>
                <button type="button" className="btn btn-ghost" onClick={() => setVoiding(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div className="actions">
              <button className="btn btn-ghost" onClick={() => setVoiding(true)}>
                Anular (correção)
              </button>
            </div>
          )
        ) : null}
      </div>
      {t.kind === "sale" && features?.slaughter ? <SlaughterReturnPanel sale={t} /> : null}
    </section>
  );
}
