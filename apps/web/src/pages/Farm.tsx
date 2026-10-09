import { ROLE_LABEL } from "@rebania/domain";
import { Link } from "react-router";
import { useSession } from "../state/session.tsx";

export function FarmPage() {
  const { farm, can, me } = useSession();
  const items = [
    { to: "/fazenda/lotes", title: "Lotes e pastos", desc: "Organização do rebanho para manejo e indicadores.", show: true },
    { to: "/fazenda/equipe", title: "Equipe", desc: "Pessoas, papéis e convites.", show: can("members.read") },
    { to: "/fazenda/sincronizacao", title: "Sincronização", desc: "Registros salvos no aparelho, rejeitados ou em conflito.", show: true },
    { to: "/fazenda/conta", title: "Minha conta", desc: "Sessões ativas e sair.", show: true },
  ];
  return (
    <section>
      <h1>Fazenda</h1>
      <p className="hint">
        {farm?.name} · {farm?.organizationName} · {me?.user.name} ({farm ? ROLE_LABEL[farm.role] : ""}) · Fuso: {farm?.timezone}
      </p>
      <div className="grid two">
        {items.filter((i) => i.show).map((i) => (
          <Link key={i.to} to={i.to} className="card" style={{ textDecoration: "none", color: "inherit" }}>
            <h2>{i.title}</h2>
            <p className="hint" style={{ margin: 0 }}>{i.desc}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
