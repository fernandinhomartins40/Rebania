import { Fingerprint, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  deviceUnlockAvailable,
  dismissOffer,
  offerDismissed,
  passkeyErrorMessage,
  registerPasskey,
  unlockName,
} from "../auth/passkey.ts";
import {
  detectPlatform,
  isSnoozed,
  isStandalone,
  justInstalled,
  subscribeInstall,
} from "../pwa/install.ts";
import { useSession } from "../state/session.tsx";
import { Alert } from "./ui.tsx";

/**
 * Depois de entrar com senha, oferece uma vez por aparelho: "entrar com a digital/Face ID".
 * Só aparece onde o aparelho tem trava própria (digital, Face ID, PIN). "Agora não" não volta.
 */
export function PasskeyOffer() {
  const { me } = useSession();
  const userId = me?.user.id;
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const check = () => {
      if (offerDismissed(userId)) return;
      // Um convite por vez: no celular, primeiro o de instalar o app.
      const mobile = detectPlatform(navigator.userAgent, navigator.maxTouchPoints) !== "desktop";
      if (mobile && !isStandalone() && !justInstalled() && !isSnoozed()) return;
      void deviceUnlockAvailable().then((ok) => alive && setShow(ok));
    };
    check();
    const unsub = subscribeInstall(check);
    return () => {
      alive = false;
      unsub();
    };
  }, [userId]);

  if (!userId || (!show && !done)) return null;
  if (done)
    return (
      <Alert kind="success">Pronto: da próxima vez, entre com {unlockName()} neste aparelho.</Alert>
    );

  return (
    <section className="install-banner" aria-label="Entrar sem senha">
      <Fingerprint className="install-icon" size={40} aria-hidden="true" />
      <div className="install-text">
        <strong>Entre sem digitar a senha</strong>
        <span>Ative a entrada com {unlockName()} neste aparelho.</span>
        {error ? <Alert kind="danger">{error}</Alert> : null}
      </div>
      <div className="install-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              if ((await registerPasskey()) === "ok") {
                dismissOffer(userId, "done");
                setDone(true);
                setShow(false);
              }
            } catch (err) {
              setError(passkeyErrorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Ativando…" : "Ativar"}
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Agora não"
          onClick={() => {
            dismissOffer(userId, "later");
            setShow(false);
          }}
        >
          <X size={20} />
        </button>
      </div>
    </section>
  );
}
