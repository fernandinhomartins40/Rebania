import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { errorMessage, post } from "../api/client.ts";
import { FullLogo } from "../components/brand.tsx";
import { Alert, Field } from "../components/ui.tsx";

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="center-page">
      <div className="card auth-card">
        <div className="auth-brand">
          <FullLogo height={72} />
        </div>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>{title}</h1>
        {children}
        <p className="hint" style={{ marginTop: 16 }}>
          <Link to="/entrar">Voltar para entrar</Link>
        </p>
      </div>
    </div>
  );
}

/** Esqueci minha senha: pede o link por e-mail (quando o envio está ligado na plataforma). */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ emailEnabled: boolean } | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(
        await post<{ emailEnabled: boolean }>("/v1/auth/password-reset/request", { email }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Frame title="Esqueci minha senha">
      {result ? (
        result.emailEnabled ? (
          <Alert kind="success">
            Se existir uma conta com esse e-mail, enviamos um link para definir uma nova senha. Ele
            vale por 1 hora.
          </Alert>
        ) : (
          <Alert kind="info">
            A recuperação por e-mail ainda não está disponível. Peça ao proprietário ou gerente da
            fazenda, ou fale com a equipe Rebania.
          </Alert>
        )
      ) : (
        <form onSubmit={submit}>
          {error ? <Alert kind="danger">{error}</Alert> : null}
          <Field id="fp-email" label="Seu e-mail">
            <input
              id="fp-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Enviando…" : "Enviar link"}
          </button>
        </form>
      )}
    </Frame>
  );
}

/** Define a nova senha a partir do link (token no fragmento da URL, que não vai a logs). */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) return setError("A senha precisa ter ao menos 10 caracteres.");
    if (password !== confirmation) return setError("A confirmação não confere.");
    setBusy(true);
    try {
      await post("/v1/auth/password-reset/confirm", { token, newPassword: password });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  if (!token)
    return (
      <Frame title="Link inválido">
        <Alert kind="danger">
          Este link está incompleto. Peça um novo em “Esqueci minha senha”.
        </Alert>
      </Frame>
    );
  return (
    <Frame title="Definir nova senha">
      {done ? (
        <>
          <Alert kind="success">Senha definida. As sessões abertas foram encerradas.</Alert>
          <button className="btn btn-primary btn-block" onClick={() => navigate("/entrar")}>
            Entrar
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          {error ? <Alert kind="danger">{error}</Alert> : null}
          <Field id="rp-new" label="Nova senha" hint="mínimo 10 caracteres">
            <input
              id="rp-new"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field id="rp-confirm" label="Repita a nova senha">
            <input
              id="rp-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Salvando…" : "Salvar nova senha"}
          </button>
        </form>
      )}
    </Frame>
  );
}
