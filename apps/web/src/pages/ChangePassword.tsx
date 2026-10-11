import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { errorMessage, post } from "../api/client.ts";
import { FullLogo } from "../components/brand.tsx";
import { Alert, Field, PageHead } from "../components/ui.tsx";
import { useSession } from "../state/session.tsx";

function PasswordForm({ provisional, onDone }: { provisional: boolean; onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 10) return setError("A nova senha precisa ter ao menos 10 caracteres.");
    if (next !== confirmation) return setError("A confirmação não confere com a nova senha.");
    if (next === current) return setError("A nova senha precisa ser diferente da atual.");
    setBusy(true);
    try {
      await post("/v1/auth/password", { currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirmation("");
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error ? <Alert kind="danger">{error}</Alert> : null}
      <Field id="pw-current" label={provisional ? "Senha provisória" : "Senha atual"}>
        <input
          id="pw-current"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </Field>
      <Field id="pw-new" label="Nova senha" hint="mínimo 10 caracteres">
        <input
          id="pw-new"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </Field>
      <Field id="pw-confirm" label="Repita a nova senha">
        <input
          id="pw-confirm"
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
  );
}

/** Primeiro acesso com senha provisória: a conta só libera esta tela até a troca. */
export function ProvisionalPasswordPage() {
  const { me, reload, logout } = useSession();
  return (
    <div className="center-page">
      <div className="card auth-card">
        <div className="auth-brand">
          <FullLogo height={72} />
        </div>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Crie sua senha</h1>
        <p className="hint" style={{ marginBottom: 16 }}>
          Você entrou como <strong>{me?.user.email}</strong> com uma senha provisória. Defina uma
          senha só sua para continuar.
        </p>
        <PasswordForm provisional onDone={() => void reload()} />
        <p className="hint" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={() => void logout()}>
            Sair
          </button>
        </p>
      </div>
    </div>
  );
}

/** Troca voluntária, a partir de "Minha conta". */
export function ChangePasswordPage({ back }: { back: string }) {
  const navigate = useNavigate();
  const [done, setDone] = useState(false);
  return (
    <section>
      <PageHead title="Trocar senha" back={back} />
      <div className="card">
        {done ? (
          <>
            <Alert kind="success">
              Senha alterada. As outras sessões foram encerradas; este aparelho continua conectado.
            </Alert>
            <button className="btn btn-secondary" onClick={() => navigate(back)}>
              Voltar
            </button>
          </>
        ) : (
          <PasswordForm provisional={false} onDone={() => setDone(true)} />
        )}
      </div>
    </section>
  );
}
