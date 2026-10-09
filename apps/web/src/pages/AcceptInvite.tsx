import { ROLE_LABEL } from "@rebania/domain";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { errorMessage, get, post } from "../api/client.ts";
import { FullLogo } from "../components/brand.tsx";
import { Alert, Field, Loading } from "../components/ui.tsx";
import { useSession } from "../state/session.tsx";

interface Preview {
  organizationName: string;
  email: string;
  role: keyof typeof ROLE_LABEL;
  expiresAt: string;
  existingUser: boolean;
}

export function AcceptInvitePage() {
  // Token vem no fragmento (#token=...), que não é enviado a servidores nem fica em logs.
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
  const navigate = useNavigate();
  const { reload } = useSession();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Link de convite incompleto.");
      return;
    }
    get<Preview>(`/v1/auth/invitations/${encodeURIComponent(token)}`).then(setPreview, (e) => setError(errorMessage(e)));
  }, [token]);

  return (
    <div className="center-page">
      <div className="card auth-card">
        <div className="auth-brand"><FullLogo height={72} /></div>
        <h1 style={{ fontSize: 24, marginBottom: 16 }}>Convite para participar da fazenda</h1>
        {error ? <Alert kind="danger">{error}</Alert> : null}
        {!preview && !error ? <Loading /> : null}
        {preview ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await post("/v1/auth/invitations/accept", { token, password, ...(preview.existingUser ? {} : { name }) });
                await post("/v1/auth/login", { email: preview.email, password, channel: "web" });
                setPassword("");
                await reload();
                navigate("/", { replace: true });
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              <strong>{preview.organizationName}</strong> convidou <strong>{preview.email}</strong> como{" "}
              <strong>{ROLE_LABEL[preview.role]}</strong>.
            </p>
            {preview.existingUser ? (
              <p className="hint">Você já tem conta. Confirme sua senha para aceitar.</p>
            ) : (
              <Field id="name" label="Seu nome">
                <input id="name" required minLength={2} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            )}
            <Field id="password" label={preview.existingUser ? "Senha" : "Crie uma senha"} hint={preview.existingUser ? undefined : "mínimo 10 caracteres"}>
              <input
                id="password"
                type="password"
                required
                minLength={10}
                autoComplete={preview.existingUser ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? "Aceitando…" : "Aceitar convite"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
