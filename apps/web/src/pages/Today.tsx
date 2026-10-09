import { addDays, CATEGORY_LABEL, daysBetween, todayInTimezone, type Category } from "@rebania/domain";
import { Link } from "react-router";
import { Loading } from "../components/ui.tsx";
import { useLocalHerd } from "../state/local-data.ts";
import { useSession } from "../state/session.tsx";
import { useSync } from "../state/sync.tsx";

function greeting(): string {
  const h = new Date().getHours();
  return h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite";
}

/**
 * Hoje: poucos indicadores e prioridades JUSTIFICADAS (motivo + origem + ação).
 * Calculado do rebanho local para funcionar sem conexão.
 */
export function TodayPage() {
  const { me, farm } = useSession();
  const { state } = useSync();
  const { animals } = useLocalHerd(farm!.id);
  if (!animals) return <Loading />;

  const today = todayInTimezone(farm!.timezone);
  const active = animals.filter((a) => a.status === "active");
  const byCategory = new Map<Category, number>();
  for (const a of active) byCategory.set(a.category, (byCategory.get(a.category) ?? 0) + 1);
  const limit = addDays(today, -90);
  const notWeighed = active.filter((a) => !a.lastWeight || daysBetween(limit, a.lastWeight.measuredOn) < 0);
  const noGroup = active.filter((a) => !a.groupId);
  const problems = state.rejected + state.conflict;

  const priorities: { title: string; why: string; to: string; action: string }[] = [];
  if (problems) {
    priorities.push({
      title: `${problems} registro(s) não aceito(s) pelo servidor`,
      why: "Revise e corrija para não perder a informação.",
      to: "/fazenda/sincronizacao",
      action: "Revisar",
    });
  }
  if (notWeighed.length) {
    priorities.push({
      title: `${notWeighed.length} animal(is) sem pesagem nos últimos 90 dias`,
      why: `Sem pesagem recente não há GMD confiável. Base: pesagens registradas até ${today.split("-").reverse().join("/")}.`,
      to: "/registrar/pesagem",
      action: "Registrar pesagem",
    });
  }
  if (noGroup.length) {
    priorities.push({
      title: `${noGroup.length} animal(is) sem lote`,
      why: "Lotes organizam manejos em grupo e indicadores.",
      to: "/rebanho?semLote=1",
      action: "Ver animais",
    });
  }

  return (
    <section>
      <h1>
        {greeting()}, {me?.user.name.split(" ")[0]}!
      </h1>
      <div className="grid kpis" style={{ marginBottom: 24 }}>
        <div className="kpi">
          <strong>{active.length}</strong>
          <span>animais ativos</span>
        </div>
        {[...byCategory.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([c, n]) => (
            <div className="kpi" key={c}>
              <strong>{n}</strong>
              <span>{CATEGORY_LABEL[c]}</span>
            </div>
          ))}
      </div>

      <div className="card">
        <h2>O que precisa de atenção</h2>
        {priorities.length === 0 ? (
          <p className="hint">Nada pendente pelos critérios disponíveis. Agenda de manejos chega com reprodução e sanidade.</p>
        ) : (
          <ul className="list">
            {priorities.map((p) => (
              <li key={p.title} className="list-item">
                <div>
                  <div className="title">{p.title}</div>
                  <div className="meta">{p.why}</div>
                </div>
                <Link className="btn btn-secondary" to={p.to}>
                  {p.action}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="actions">
        <Link to="/registrar" className="btn btn-primary">
          Iniciar registro
        </Link>
        <Link to="/rebanho" className="btn btn-secondary">
          Ver rebanho
        </Link>
      </div>
      {active.length === 0 ? (
        <p className="hint" style={{ marginTop: 16 }}>
          Ainda não há animais nesta fazenda. Comece pelo <Link to="/registrar/animal">cadastro</Link>.
        </p>
      ) : null}
    </section>
  );
}
