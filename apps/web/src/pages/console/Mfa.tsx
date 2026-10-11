import QRCode from "qrcode";
import { useEffect, useState, type FormEvent } from "react";
import { errorMessage, post } from "../../api/client.ts";
import { FullLogo } from "../../components/brand.tsx";
import { Alert, Field, Loading } from "../../components/ui.tsx";
import { useSession } from "../../state/session.tsx";

function CodeForm({ path, label, onDone }: { path: string; label: string; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post(path, { code: code.replace(/\s+/g, "") });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      {error ? <Alert kind="danger">{error}</Alert> : null}
      <Field id="mfa-code" label="Código de 6 dígitos">
        <input
          id="mfa-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </Field>
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? "Conferindo…" : label}
      </button>
    </form>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  const { logout } = useSession();
  return (
    <div className="center-page">
      <div className="card auth-card">
        <div className="auth-brand">
          <FullLogo height={72} />
        </div>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>{title}</h1>
        {children}
        <p className="hint" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={() => void logout()}>
            Sair
          </button>
        </p>
      </div>
    </div>
  );
}

/** Primeiro acesso da equipe: liga a verificação em duas etapas num app autenticador. */
export function MfaSetupPage() {
  const { reload } = useSession();
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    post<{ secret: string; otpauthUri: string }>("/v1/platform/mfa/setup").then(
      async (s) => {
        setSetup(s);
        setQr(await QRCode.toDataURL(s.otpauthUri, { margin: 1, width: 220 }));
      },
      (e) => setError(errorMessage(e)),
    );
  }, []);
  return (
    <Frame title="Verificação em duas etapas">
      <p className="hint" style={{ marginBottom: 16 }}>
        O console exige um código do seu celular além da senha. Use Google Authenticator, Microsoft
        Authenticator, 1Password ou similar.
      </p>
      {error ? <Alert kind="danger">{error}</Alert> : null}
      {!setup ? (
        error ? null : (
          <Loading />
        )
      ) : (
        <>
          <ol style={{ paddingLeft: 20, margin: "0 0 12px" }}>
            <li>Abra o aplicativo autenticador e adicione uma conta.</li>
            <li>Leia o código abaixo (ou digite a chave).</li>
            <li>Informe o código de 6 dígitos que aparecer.</li>
          </ol>
          {qr ? (
            <img
              src={qr}
              width={220}
              height={220}
              alt="Código QR para o aplicativo autenticador"
              style={{ display: "block", margin: "0 auto 12px" }}
            />
          ) : null}
          <p className="hint">Chave para digitar:</p>
          <p className="secret-box">{setup.secret}</p>
          <CodeForm path="/v1/platform/mfa/enable" label="Ativar" onDone={() => void reload()} />
        </>
      )}
    </Frame>
  );
}

/** Nova sessão da equipe: confirma o código do aplicativo autenticador. */
export function MfaVerifyPage() {
  const { reload } = useSession();
  return (
    <Frame title="Confirme o código">
      <p className="hint" style={{ marginBottom: 16 }}>
        Abra o aplicativo autenticador e informe o código do Rebania.
      </p>
      <CodeForm
        path="/v1/platform/mfa/verify"
        label="Entrar no console"
        onDone={() => void reload()}
      />
      <p className="hint" style={{ marginTop: 12 }}>
        Perdeu o celular? Peça a um administrador da equipe para zerar sua verificação.
      </p>
    </Frame>
  );
}
