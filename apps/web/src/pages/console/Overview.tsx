import { Link } from "react-router";
import { Alert, Empty, PageHead } from "../../components/ui.tsx";
import { brl, Kpi, Loaded, STAGE_LABEL, useResource } from "./kit.tsx";

export interface AlertDto {
  severity: "critical" | "warning" | "info";
  key: string;
  title: string;
  detail: string;
  href?: string;
}

interface OverviewDto {
  customers: { byStage: Record<string, number>; newThisMonth: number; churnedThisMonth: number };
  finance: {
    mrrCents: number;
    receivableCents: number;
    overdueCents: number;
    overdueCount: number;
    receivedThisMonthCents: number;
  };
  onboarding: { customers: number; overdueSteps: number };
  support: { active: number; waitingTeam: number; unassigned: number; breached: number };
  usage: { activeUsers7d: number; aiQuestions30d: number; aiCredits30d: number };
  alerts: AlertDto[];
}

export function AlertList({ alerts }: { alerts: AlertDto[] }) {
  if (!alerts.length) return <Alert kind="success">Nenhum alerta no momento.</Alert>;
  return (
    <ul className="console-alerts">
      {alerts.map((a) => (
        <li key={a.key} className={a.severity}>
          <div>
            <strong>{a.title}</strong>
            <div className="hint">{a.detail}</div>
          </div>
          {a.href ? <Link to={a.href}>Ver</Link> : null}
        </li>
      ))}
    </ul>
  );
}

/** T07 Visão geral: clientes, dinheiro, implantação, suporte, uso e alertas. */
export function OverviewPage() {
  const r = useResource<OverviewDto>("/v1/platform/overview");
  return (
    <section>
      <PageHead title="Visão geral" />
      <Loaded r={r}>
        {(d) => (
          <>
            <h2 className="section-title">Alertas</h2>
            <AlertList alerts={d.alerts} />

            <h2 className="section-title">Financeiro</h2>
            <div className="console-kpis">
              <Kpi label="Receita recorrente mensal" value={brl(d.finance.mrrCents)} />
              <Kpi label="Recebido neste mês" value={brl(d.finance.receivedThisMonthCents)} />
              <Kpi label="A receber" value={brl(d.finance.receivableCents)} />
              <Kpi
                label="Em atraso"
                value={brl(d.finance.overdueCents)}
                hint={`${d.finance.overdueCount} fatura(s)`}
              />
            </div>

            <h2 className="section-title">Clientes</h2>
            <div className="console-kpis">
              {Object.entries(d.customers.byStage).map(([stage, n]) => (
                <Kpi
                  key={stage}
                  label={STAGE_LABEL[stage] ?? stage}
                  value={<Link to={`/console/clientes?stage=${stage}`}>{n}</Link>}
                />
              ))}
              <Kpi label="Novos no mês" value={d.customers.newThisMonth} />
              <Kpi label="Encerrados no mês" value={d.customers.churnedThisMonth} />
            </div>

            <div className="grid two">
              <div>
                <h2 className="section-title">Implantação e suporte</h2>
                <div className="console-kpis">
                  <Kpi
                    label="Implantações em andamento"
                    value={d.onboarding.customers}
                    hint={`${d.onboarding.overdueSteps} etapa(s) atrasada(s)`}
                  />
                  <Kpi
                    label="Chamados em aberto"
                    value={d.support.active}
                    hint={`${d.support.waitingTeam} aguardando a equipe`}
                  />
                  <Kpi label="Sem responsável" value={d.support.unassigned} />
                  <Kpi label="Prazo estourado" value={d.support.breached} />
                </div>
              </div>
              <div>
                <h2 className="section-title">Uso</h2>
                <div className="console-kpis">
                  <Kpi label="Usuários ativos (7 dias)" value={d.usage.activeUsers7d} />
                  <Kpi label="Perguntas ao assistente (30 dias)" value={d.usage.aiQuestions30d} />
                  <Kpi label="Créditos consumidos (30 dias)" value={d.usage.aiCredits30d} />
                </div>
              </div>
            </div>
            {Object.values(d.customers.byStage).every((n) => n === 0) ? (
              <Empty title="Nenhum cliente ainda">
                <Link className="btn btn-soft" to="/console/clientes">
                  Criar a primeira implantação
                </Link>
              </Empty>
            ) : null}
          </>
        )}
      </Loaded>
    </section>
  );
}
