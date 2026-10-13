import { Fingerprint } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { errorMessage, get, post } from "../api/client.ts";
import {
  dismissOffer,
  passkeyErrorMessage,
  passkeySupported,
  registerPasskey,
} from "../auth/passkey.ts";
import { useSession } from "../state/session.tsx";
import { Alert, formatDateTime, Loading } from "./ui.tsx";

interface PasskeyRow {
  id: string;
  label: string;
  synced: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Minha conta → aparelhos que entram com digital, senha do celular ou Face ID. */
export function PasskeysCard() {
  const { me } = useSession();
  const [items, setItems] = useState<PasskeyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const supported = passkeySupported();
  const load = useCallback(
    () =>
      get<{ items: PasskeyRow[] }>("/v1/auth/passkeys").then(
        (r) => setItems(r.items),
        (e) => setError(errorMessage(e)),
      ),
    [],
  );
  useEffect(() => void load(), [load]);

  return (
    <div className="card">
      <h2>Entrar sem senha</h2>
      <p className="hint">
        Use a digital, a senha do celular ou o Face ID para entrar. A biometria fica no aparelho: o
        Rebania nunca a recebe.
      </p>
      {error ? <Alert kind="danger">{error}</Alert> : null}
      {!items ? (
        <Loading />
      ) : items.length === 0 ? (
        <p>Nenhum aparelho ativado.</p>
      ) : (
        <ul className="list">
          {items.map((p) => (
            <li key={p.id} className="list-item">
              <span>
                <span className="title">{p.label}</span>
                {p.synced ? (
                  <span className="badge badge-muted" style={{ marginLeft: 8 }}>
                    sincronizada
                  </span>
                ) : null}
                <div className="meta">
                  Ativado em {formatDateTime(p.createdAt)} · último uso:{" "}
                  {p.lastUsedAt ? formatDateTime(p.lastUsedAt) : "ainda não usado"}
                </div>
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={async () => {
                  if (!confirm(`Remover "${p.label}"? Ele volta a entrar só com a senha.`)) return;
                  try {
                    await post(`/v1/auth/passkeys/${p.id}/revoke`);
                    await load();
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                }}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
      {supported ? (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              if ((await registerPasskey()) === "ok") {
                if (me) dismissOffer(me.user.id, "done");
                await load();
              }
            } catch (e) {
              setError(passkeyErrorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Fingerprint size={20} aria-hidden="true" />{" "}
          {busy ? "Ativando…" : "Ativar neste aparelho"}
        </button>
      ) : (
        <p className="hint">Este navegador não permite entrar com digital ou Face ID.</p>
      )}
    </div>
  );
}
