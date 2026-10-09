import { ArrowLeftRight, ChevronRight, Weight, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { BrandCow, type IconComponent } from "../components/brand.tsx";
import { PageHead } from "../components/ui.tsx";
import { useSession } from "../state/session.tsx";

/**
 * Registrar: só lista jornadas implementadas (MN §5: não rotular como disponível
 * o que ainda não existe). Reprodução, sanidade, trato e venda entram nos goals G3–G5.
 */
export function RegisterPage() {
  const { can } = useSession();
  const items: {
    to: string;
    title: string;
    desc: string;
    icon: IconComponent | LucideIcon;
    ochre?: boolean;
    perm: "animals.write" | "events.write";
  }[] = [
    {
      to: "/registrar/animal",
      title: "Cadastrar animal",
      desc: "Brinco ou ID provisório, sexo, categoria e origem.",
      icon: BrandCow,
      perm: "animals.write",
    },
    {
      to: "/registrar/pesagem",
      title: "Pesagem",
      desc: "Ler ou digitar o brinco e informar o peso vivo.",
      icon: Weight,
      ochre: true,
      perm: "events.write",
    },
    {
      to: "/registrar/movimentacao",
      title: "Movimentação",
      desc: "Trocar de lote ou pasto com data efetiva.",
      icon: ArrowLeftRight,
      perm: "events.write",
    },
  ];
  const visible = items.filter((i) => can(i.perm));
  return (
    <section>
      <PageHead title="Registrar" />
      {visible.length === 0 ? (
        <p className="hint">Seu perfil não registra manejos nesta fazenda.</p>
      ) : (
        <div className="grid two">
          {visible.map((i) => (
            <Link key={i.to} to={i.to} className="card menu-card">
              <span className={`ic ${i.ochre ? "ochre" : ""}`}>
                <i.icon size={30} aria-hidden="true" />
              </span>
              <span style={{ flex: 1 }}>
                <h2>{i.title}</h2>
                <p className="hint">{i.desc}</p>
              </span>
              <ChevronRight size={22} aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
