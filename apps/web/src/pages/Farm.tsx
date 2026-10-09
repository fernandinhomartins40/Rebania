import {
  ChevronRight,
  CloudUpload,
  Settings,
  Venus,
  FileSpreadsheet,
  Building2,
  ChartColumn,
  CircleAlert,
  Tractor,
  Trees,
  Warehouse,
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
import { useFeatures } from "../state/features.ts";
import { PageHead } from "../components/ui.tsx";
import { useSession } from "../state/session.tsx";

export function FarmPage() {
  const { farm, can, me } = useSession();
  const features = useFeatures(farm!.id);
  const [staff, setStaff] = useState(false);
  useEffect(() => {
    get<{ isPlatformAdmin: boolean }>("/v1/platform/me").then(
      (r) => setStaff(r.isPlatformAdmin),
      () => setStaff(false),
    );
  }, []);
  const items: {
    to: string;
    section: string;
    title: string;
    desc: string;
    icon: LucideIcon;
    show: boolean;
  }[] = [
    {
      to: "/fazenda/lotes",
      section: "Manejo",
      title: "Lotes e pastos",
      desc: "Organização do rebanho para manejo e indicadores.",
      icon: MapPin,
      show: true,
    },
    {
      to: "/reproducao",
      section: "Manejo",
      title: "Reprodução",
      desc: "Partos previstos, estações de monta e protocolos IATF.",
      icon: Venus,
      show: true,
    },
    {
      to: "/sanidade",
      section: "Manejo",
      title: "Sanidade",
      desc: "Calendário, carências, tratamentos e exames.",
      icon: ShieldPlus,
      show: true,
    },
    {
      to: "/fazenda/estoque",
      section: "Gestão",
      title: "Estoque",
      desc: "Insumos, lotes e validade, sêmen, saldo e conferência.",
      icon: Package,
      show: true,
    },
    {
      to: "/comercial",
      section: "Gestão",
      title: "Compra e venda",
      desc: "Vendas com verificação de carência, compras e rateio.",
      icon: HandCoins,
      show: can("finance.read"),
    },
    {
      to: "/fazenda/financeiro",
      section: "Gestão",
      title: "Financeiro",
      desc: "Contas a pagar e receber, caixa e rateio por lote.",
      icon: Wallet,
      show: can("finance.read"),
    },
    {
      to: "/relatorios",
      section: "Gestão",
      title: "Relatórios",
      desc: "Indicadores com fórmula, período e cobertura; CSV e PDF.",
      icon: ChartColumn,
      show: can("reports.read") || can("finance.read"),
    },
    {
      to: "/ocorrencias",
      section: "Manejo",
      title: "Ocorrências",
      desc: "Problemas em animais, lotes, pastos e equipamentos.",
      icon: CircleAlert,
      show: true,
    },
    {
      to: "/fazenda/confinamento",
      section: "Manejo",
      title: "Confinamento",
      desc: "Baias, leitura de cocho e fechamento.",
      icon: Warehouse,
      show: Boolean(features?.confinement),
    },
    {
      to: "/fazenda/pastagem",
      section: "Manejo",
      title: "Pastagem",
      desc: "Ocupação, descanso e chuva.",
      icon: Trees,
      show: Boolean(features?.pasture),
    },
    {
      to: "/fazenda/patrimonio",
      section: "Gestão",
      title: "Patrimônio",
      desc: "Máquinas, veículos e manutenção.",
      icon: Tractor,
      show: Boolean(features?.assets),
    },
    {
      to: "/assistente",
      section: "Gestão",
      title: "Assistente inteligente",
      desc: "Perguntas sobre o rebanho e rascunhos que você confirma.",
      icon: Sparkles,
      show: true,
    },
    {
      to: "/fazenda/plano",
      section: "Organização e conta",
      title: "Plano e créditos",
      desc: "Contrato, faturas, créditos do assistente e acesso de suporte.",
      icon: Coins,
      show: can("org.manage"),
    },
    {
      to: "/fazenda/configuracoes",
      section: "Organização e conta",
      title: "Configurações",
      desc: "Nome da fazenda e parâmetros de reprodução.",
      icon: Settings,
      show: true,
    },
    {
      to: "/fazenda/importar",
      section: "Organização e conta",
      title: "Importar rebanho",
      desc: "Planilha CSV com revisão antes de gravar.",
      icon: FileSpreadsheet,
      show: can("animals.write"),
    },
    {
      to: "/fazenda/equipe",
      section: "Organização e conta",
      title: "Equipe",
      desc: "Pessoas, papéis e convites.",
      icon: Users,
      show: can("members.read"),
    },
    {
      to: "/fazenda/sincronizacao",
      section: "Organização e conta",
      title: "Sincronização",
      desc: "Registros no aparelho, rejeitados ou em conflito.",
      icon: CloudUpload,
      show: true,
    },
    {
      to: "/console",
      section: "Organização e conta",
      title: "Console da plataforma",
      desc: "Equipe Rebania: implantação, contratos, faturas e créditos.",
      icon: Building2,
      show: staff,
    },
    {
      to: "/fazenda/conta",
      section: "Organização e conta",
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
      {["Manejo", "Gestão", "Organização e conta"].map((section) => (
        <div key={section}>
          <h2 className="section-title">{section}</h2>
          <div className="grid two">
            {items
              .filter((i) => i.show && i.section === section)
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
        </div>
      ))}
    </section>
  );
}
