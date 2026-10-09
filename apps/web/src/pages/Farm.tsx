import {
  ChevronRight,
  CloudUpload,
  FileSpreadsheet,
  MapPin,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ROLE_LABEL } from "@rebania/domain";
import { Link } from "react-router";
import { PageHead } from "../components/ui.tsx";
import { useSession } from "../state/session.tsx";

export function FarmPage() {
  const { farm, can, me } = useSession();
  const items: { to: string; title: string; desc: string; icon: LucideIcon; show: boolean }[] = [
    {
      to: "/fazenda/lotes",
      title: "Lotes e pastos",
      desc: "Organização do rebanho para manejo e indicadores.",
      icon: MapPin,
      show: true,
    },
    {
      to: "/fazenda/importar",
      title: "Importar rebanho",
      desc: "Planilha CSV com revisão antes de gravar.",
      icon: FileSpreadsheet,
      show: can("animals.write"),
    },
    {
      to: "/fazenda/equipe",
      title: "Equipe",
      desc: "Pessoas, papéis e convites.",
      icon: Users,
      show: can("members.read"),
    },
    {
      to: "/fazenda/sincronizacao",
      title: "Sincronização",
      desc: "Registros no aparelho, rejeitados ou em conflito.",
      icon: CloudUpload,
      show: true,
    },
    {
      to: "/fazenda/conta",
      title: "Minha conta",
      desc: "Sessões ativas e sair.",
      icon: UserRound,
      show: true,
    },
  ];
  return (
    <section>
      <PageHead title="Fazenda" />
      <p className="hint">
        {farm?.name} · {farm?.organizationName} · {me?.user.name} (
        {farm ? ROLE_LABEL[farm.role] : ""}) · Fuso: {farm?.timezone}
      </p>
      <div className="grid two">
        {items
          .filter((i) => i.show)
          .map((i) => (
            <Link key={i.to} to={i.to} className="card menu-card">
              <span className="ic">
                <i.icon size={28} aria-hidden="true" />
              </span>
              <span style={{ flex: 1 }}>
                <h2>{i.title}</h2>
                <p className="hint">{i.desc}</p>
              </span>
              <ChevronRight size={22} aria-hidden="true" />
            </Link>
          ))}
      </div>
    </section>
  );
}
