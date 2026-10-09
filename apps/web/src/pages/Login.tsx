import { useState } from "react";
import { post, errorMessage } from "../api/client.ts";
import { Link } from "react-router";
import { FullLogo } from "../components/brand.tsx";
import { Alert, Field } from "../components/ui.tsx";
import { useSession } from "../state/session.tsx";

export function LoginPage() {
  const { reload } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="center-page">
      <div className="card auth-card">
        <div className="auth-brand">
          <FullLogo height={72} />
        </div>
        <h1 style={{ fontSize: 24, marginBottom: 16 }}>Entrar</h1>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await post("/v1/auth/login", { email, password, channel: "web" });
              setPassword("");
              await reload();
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error ? <Alert kind="danger">{error}</Alert> : null}
          <Field id="email" label="E-mail">
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field id="password" label="Senha">
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="hint" style={{ marginTop: 16 }}>
          Esqueceu a senha? Peça ao proprietário ou gerente da fazenda um novo convite.
        </p>
        <p className="hint">
          <Link to="/">Conhecer o Rebania</Link>
        </p>
      </div>
    </div>
  );
}
