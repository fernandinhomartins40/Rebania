import { KeyRound, LogOut } from "lucide-react";
import { Link, Outlet } from "react-router";
import { useSession } from "../state/session.tsx";
import { Logo } from "./brand.tsx";

/**
 * Moldura da equipe da plataforma sem fazendas: só o console e a própria conta.
 * Quem também tem fazenda usa o console dentro do app normal (Fazenda → Console).
 */
export function ConsoleShell() {
  const { me, logout } = useSession();
  return (
    <div className="main">
      <header className="appbar">
        <Logo to="/console" />
        <span style={{ flex: 1 }} />
        <div className="appbar-actions">
          <span className="hint hide-narrow">{me?.user.email}</span>
          <Link to="/conta/senha" className="icon-btn" aria-label="Trocar senha">
            <KeyRound size={24} />
          </Link>
          <button
            type="button"
            className="icon-btn"
            aria-label="Sair"
            onClick={() => void logout()}
          >
            <LogOut size={24} />
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
