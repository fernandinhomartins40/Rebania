import {
  ChevronRight,
  CloudUpload,
  Settings,
  Venus,
  FileSpreadsheet,
  Building2,
  ChartColumn,
  Coins,
  Sparkles,
  HandCoins,
  MapPin,
  Package,
  Wallet,
  ShieldPlus,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ROLE_LABEL } from "@rebania/domain";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { get } from "../api/client.ts";
import { PageHead } from "../components/ui.tsx";
import { useSession } from "../state/session.tsx";

export function FarmPage() {
  const { farm, can, me } = useSession();
  const [staff, setStaff] = useState(false);
  useEffect(() => {
    get<{ isPlatformAdmin: boolean }>("/v1/platform/me").then(
      (r) => setStaff(r.isPlatformAdmin),
      () => setStaff(false),
    );
  }, []);
  const items: { to: string; title: string; desc: string; icon: LucideIcon; show: boolean }[] = [
    {
      to: "/fazenda/lotes",
      title: "Lotes e pastos",
      desc: "Organização do rebanho para manejo e indicadores.",
      icon: MapPin,
      show: true,
    },
    {
      to: "/reproducao",
      title: "Reprodução",
      desc: "Partos previstos, estações de monta e protocolos IATF.",
      icon: Venus,
      show: true,
    },
    {
      to: "/sanidade",
      title: "Sanidade",
      desc: "Calendário, carências, tratamentos e exames.",
      icon: ShieldPlus,
      show: true,
    },
    {
      to: "/fazenda/estoque",
      title: "Estoque",
      desc: "Insumos, lotes e validade, sêmen, saldo e conferência.",
      icon: Package,
      show: true,
    },
    {
      to: "/comercial",
      title: "Compra e venda",
      desc: "Vendas com verificação de carência, compras e rateio.",
      icon: HandCoins,
      show: can("finance.read"),
    },
    {
      to: "/fazenda/financeiro",
      title: "Financeiro",
      desc: "Contas a pagar e receber, caixa e rateio por lote.",
      icon: Wallet,
      show: can("finance.read"),
    },
    {
      to: "/relatorios",
      title: "Relatórios",
      desc: "Indicadores com fórmula, período e cobertura; CSV e PDF.",
      icon: ChartColumn,
      show: can("reports.read") || can("finance.read"),
    },
    {
      to: "/assistente",
      title: "Assistente inteligente",
      desc: "Perguntas sobre o rebanho e rascunhos que você confirma.",
      icon: Sparkles,
      show: true,
    },
    {
      to: "/fazenda/plano",
      title: "Plano e créditos",
      desc: "Contrato, faturas, créditos do assistente e acesso de suporte.",
      icon: Coins,
      show: can("org.manage"),
    },
    {
      to: "/fazenda/configuracoes",
      title: "Configurações",
      desc: "Nome da fazenda e parâmetros de reprodução.",
      icon: Settings,
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
      to: "/console",
      title: "Console da plataforma",
      desc: "Equipe Rebania: implantação, contratos, faturas e créditos.",
      icon: Building2,
      show: staff,
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
