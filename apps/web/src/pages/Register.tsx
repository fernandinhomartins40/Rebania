import {
  ArrowLeftRight,
  Baby,
  ChevronRight,
  ClipboardList,
  FlaskConical,
  HeartPulse,
  LogOut,
  Wheat,
  Syringe,
  Stethoscope,
  Venus,
  Weight,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import { BrandCow, type IconComponent } from "../components/brand.tsx";
import { PageHead } from "../components/ui.tsx";
import { useSession } from "../state/session.tsx";

/**
 * Registrar: só lista jornadas implementadas (MN §5: não rotular como disponível
 * o que ainda não existe).
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
    {
      to: "/registrar/nascimento",
      title: "Nascimento",
      desc: "Mãe, data, sexo e identificação da cria; gêmeos e natimorto.",
      icon: Baby,
      ochre: true,
      perm: "events.write",
    },
    {
      to: "/registrar/inseminacao",
      title: "Inseminação ou monta",
      desc: "Inseminação artificial, monta natural ou repasse, em grupo.",
      icon: Venus,
      perm: "events.write",
    },
    {
      to: "/registrar/diagnostico",
      title: "Diagnóstico de prenhez",
      desc: "Prenha, vazia ou inconclusivo, com responsável.",
      icon: Stethoscope,
      perm: "events.write",
    },
    {
      to: "/registrar/desmama",
      title: "Desmama",
      desc: "Bezerros desmamados com peso opcional.",
      icon: HeartPulse,
      perm: "events.write",
    },
    {
      to: "/curral",
      title: "Modo Curral",
      desc: "Leitor, peso e aplicações animal a animal, com retomada.",
      icon: ClipboardList,
      ochre: true,
      perm: "events.write",
    },
    {
      to: "/registrar/aplicacao",
      title: "Vacinação e aplicação",
      desc: "Produto, dose, lote e via em grupo; baixa no estoque.",
      icon: Syringe,
      perm: "events.write",
    },
    {
      to: "/registrar/tratamento",
      title: "Tratamento",
      desc: "Ocorrência, plano do responsável e resposta.",
      icon: Stethoscope,
      perm: "events.write",
    },
    {
      to: "/registrar/trato",
      title: "Trato",
      desc: "Dieta e quantidade por lote; baixa no estoque.",
      icon: Wheat,
      perm: "events.write",
    },
    {
      to: "/registrar/saida",
      title: "Morte, descarte ou transferência",
      desc: "Encerra a situação do animal sem apagar o histórico.",
      icon: LogOut,
      perm: "events.write",
    },
    {
      to: "/registrar/exame",
      title: "Exame",
      desc: "Coleta em animal ou grupo; resultado depois.",
      icon: FlaskConical,
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
