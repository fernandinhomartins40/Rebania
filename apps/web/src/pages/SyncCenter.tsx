import type { OutboxItem } from "@rebania/sync-core";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Alert, Empty, formatDateTime, Loading, PageHead } from "../components/ui.tsx";
import { useSync } from "../state/sync.tsx";

const TYPE_LABEL: Record<string, string> = {
  "animal.create": "Cadastro de animal",
  "animal.update": "Edição de animal",
  "animal.move": "Movimentação",
  "weight.record": "Pesagem",
};

/** T-Conflito de sync: pendência → comparar consequência → resolver; nunca apaga em silêncio. */
export function SyncCenterPage() {
  const { engine, state, version } = useSync();
  const [items, setItems] = useState<OutboxItem[] | null>(null);
  const load = useCallback(() => engine.problems().then(setItems), [engine]);
  useEffect(() => void load(), [load, version, state.pending, state.rejected, state.conflict]);

  return (
    <section>
      <PageHead title="Sincronização" back="/fazenda" />
      <div className="card">
        <p>
          {state.online ? "Conectado" : "Sem internet"} · Última sincronização:{" "}
          {formatDateTime(state.lastSyncAt)}
        </p>
        {state.lastError ? <Alert kind="danger">{state.lastError}</Alert> : null}
        <button
          className="btn btn-secondary"
          disabled={state.phase === "syncing"}
          onClick={() => void engine.syncNow()}
        >
          {state.phase === "syncing" ? "Sincronizando…" : "Sincronizar agora"}
        </button>
      </div>
      <div className="card">
        <h2>Registros no aparelho</h2>
        {!items ? (
          <Loading />
        ) : items.length === 0 ? (
          <Empty title="Tudo enviado" />
        ) : (
          <ul className="list">
            {items.map((i) => (
              <li key={i.mutation.mutationId} className="list-item">
                <span>
                  <span className="title">{TYPE_LABEL[i.mutation.type] ?? i.mutation.type}</span>{" "}
                  <span
                    className={`badge ${i.state === "pending" ? "badge-warn" : "badge-muted"}`}
                    style={i.state !== "pending" ? { color: "var(--color-danger)" } : undefined}
                  >
                    {i.state === "pending"
                      ? "aguardando envio"
                      : i.state === "conflict"
                        ? "conflito"
                        : "rejeitado"}
                  </span>
                  <div className="meta">
                    Registrado em {formatDateTime(i.mutation.createdAt)}
                    {i.lastError ? ` · ${i.lastError.message}` : ""}
                  </div>
                  {i.state === "conflict" ? (
                    <div className="meta">
                      O animal foi alterado em outro aparelho. A versão do servidor foi mantida;
                      descarte esta alteração e refaça se ainda for necessária.
                    </div>
                  ) : null}
                </span>
                {i.state !== "pending" ? (
                  <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Link className="btn btn-ghost" to={`/rebanho/${i.mutation.entityId}`}>
                      Ver animal
                    </Link>
                    <button
                      className="btn btn-danger"
                      onClick={async () => {
                        if (
                          !confirm(
                            "Descartar este registro do aparelho? Esta ação não pode ser desfeita.",
                          )
                        )
                          return;
                        await engine.discard(i.mutation.mutationId);
                        await load();
                      }}
                    >
                      Descartar
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
