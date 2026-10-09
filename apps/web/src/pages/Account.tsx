import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { errorMessage, get, post } from "../api/client.ts";
import { Alert, formatDateTime, Loading, PageHead } from "../components/ui.tsx";
import { useSession } from "../state/session.tsx";
import { useSync } from "../state/sync.tsx";

interface SessionRow {
  id: string;
  channel: "web" | "mobile";
  deviceLabel: string | null;
  lastUsedAt: string;
  current: boolean;
}

export function AccountPage() {
  const { me, logout } = useSession();
  const { state } = useSync();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      get<SessionRow[]>("/v1/auth/sessions").then(setSessions, (e) => setError(errorMessage(e))),
    [],
  );
  useEffect(() => void load(), [load]);
  const unsent = state.pending + state.rejected + state.conflict;

  return (
    <section>
      <PageHead title="Minha conta" back="/fazenda" />
      <div className="card">
        <p>
          <strong>{me?.user.name}</strong>
          <br />
          <span className="hint">{me?.user.email}</span>
        </p>
        {unsent > 0 ? (
          <Alert kind="warning">
            Há {unsent} registro(s) ainda não enviados neste aparelho. Ao sair, eles serão apagados
            deste aparelho. <Link to="/fazenda/sincronizacao">Ver registros</Link>
          </Alert>
        ) : null}
        <button
          className="btn btn-secondary"
          onClick={async () => {
            if (
              unsent > 0 &&
              !confirm(`Sair e apagar ${unsent} registro(s) não enviados deste aparelho?`)
            )
              return;
            await logout();
          }}
        >
          Sair deste aparelho
        </button>
      </div>
      <div className="card">
        <h2>Sessões ativas</h2>
        {error ? <Alert kind="danger">{error}</Alert> : null}
        {!sessions ? (
          <Loading />
        ) : (
          <ul className="list">
            {sessions.map((s) => (
              <li key={s.id} className="list-item">
                <span>
                  <span className="title">
                    {s.channel === "web" ? "Navegador" : (s.deviceLabel ?? "Aplicativo")}
                  </span>
                  {s.current ? (
                    <span className="badge badge-ok" style={{ marginLeft: 8 }}>
                      este aparelho
                    </span>
                  ) : null}
                  <div className="meta">Último uso: {formatDateTime(s.lastUsedAt)}</div>
                </span>
                {!s.current ? (
                  <button
                    className="btn btn-danger"
                    onClick={async () => {
                      await post(`/v1/auth/sessions/${s.id}/revoke`);
                      await load();
                    }}
                  >
                    Encerrar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
