import { Link } from "react-router";
import { useSession } from "../state/session.tsx";

/**
 * Registrar: só lista jornadas implementadas (MN §5: não rotular como disponível
 * o que ainda não existe). Reprodução, sanidade, trato e venda entram nos goals G3–G5.
 */
export function RegisterPage() {
  const { can } = useSession();
  const items = [
    { to: "/registrar/animal", title: "Cadastrar animal", desc: "Brinco ou ID provisório, sexo, categoria e origem.", perm: "animals.write" as const },
    { to: "/registrar/pesagem", title: "Pesagem", desc: "Ler ou digitar o brinco e informar o peso vivo.", perm: "events.write" as const },
    { to: "/registrar/movimentacao", title: "Movimentação", desc: "Trocar o animal de lote ou pasto com data efetiva.", perm: "events.write" as const },
  ].filter((i) => can(i.perm));
  return (
    <section>
      <h1>Registrar</h1>
      {items.length === 0 ? (
        <p className="hint">Seu perfil não registra manejos nesta fazenda.</p>
      ) : (
        <div className="grid two">
          {items.map((i) => (
            <Link key={i.to} to={i.to} className="card" style={{ textDecoration: "none", color: "inherit" }}>
              <h2>{i.title}</h2>
              <p className="hint" style={{ margin: 0 }}>{i.desc}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
