import {
  ArrowRight,
  Baby,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Package,
  ShieldAlert,
  MapPin,
  Moon,
  Play,
  Sun,
  TriangleAlert,
  Weight,
} from "lucide-react";
import { BrandCow, type IconComponent } from "../components/brand.tsx";
import {
  addDays,
  ageInMonths,
  CATEGORY_LABEL,
  daysBetween,
  todayInTimezone,
} from "@rebania/domain";
import { Link, useNavigate } from "react-router";
import { Landscape } from "../components/brand.tsx";
import { AnimalPhoto, Loading } from "../components/ui.tsx";
import { useLocalHerd } from "../state/local-data.ts";
import { useSession } from "../state/session.tsx";
import { useSync } from "../state/sync.tsx";
import { useOpenTasks } from "../state/tasks.ts";
import { useProducts } from "../state/health.ts";
import { listLocalSessions, summaryOf, type LocalSession } from "../offline/curral.ts";
import { useEffect, useState } from "react";

function greeting(): { text: string; night: boolean } {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return { text: "Bom dia", night: false };
  if (h >= 12 && h < 18) return { text: "Boa tarde", night: false };
  return { text: "Boa noite", night: true };
}

interface Priority {
  icon: IconComponent;
  title: string;
  why: string;
  to: string;
  action: string;
}

/**
 * Hoje: poucos indicadores e prioridades JUSTIFICADAS (motivo + origem + ação).
 * Calculado do rebanho local para funcionar sem conexão.
 */
export function TodayPage() {
  const { me, farm, farms, selectFarm } = useSession();
  const { state } = useSync();
  const { animals, places } = useLocalHerd(farm!.id);
  const { tasks } = useOpenTasks(farm!.id);
  const { products } = useProducts(farm!.id);
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  useEffect(() => {
    void listLocalSessions(farm!.id).then((l) => setSessions(l.filter((x) => x.status === "open")));
  }, [farm]);
  const navigate = useNavigate();
  if (!animals) return <Loading />;

  const today = todayInTimezone(farm!.timezone);
  const active = animals.filter((a) => a.status === "active");
  const cows = active.filter((a) => a.category === "cow").length;
  const weighed30 = active.filter(
    (a) => a.lastWeight && daysBetween(addDays(today, -30), a.lastWeight.measuredOn) >= 0,
  ).length;
  const notWeighed = active.filter(
    (a) => !a.lastWeight || daysBetween(addDays(today, -90), a.lastWeight.measuredOn) < 0,
  );
  const noGroup = active.filter((a) => !a.groupId);
  const problems = state.rejected + state.conflict;

  const dueTasks = (tasks ?? []).filter((t) => daysBetween(t.dueOn, today) >= 0);
  const overdue = dueTasks.filter((t) => t.dueOn < today);
  const pregnant = active.filter((a) => a.repro?.status === "pregnant").length;
  const calving30 = active.filter(
    (a) => a.repro?.expectedCalvingOn && daysBetween(today, a.repro.expectedCalvingOn) <= 30,
  );
  const inWithdrawal = active.filter(
    (a) => a.withdrawal?.meatUntil && a.withdrawal.meatUntil >= today,
  ).length;
  const lowStock = (products ?? []).filter((p) => p.belowMin);
  const stockReview = (products ?? []).reduce((n, p) => n + p.pendingReview, 0);
  const priorities: Priority[] = [];
  for (const sess of sessions.slice(0, 2)) {
    const sm = summaryOf(sess);
    priorities.push({
      icon: ClipboardList,
      title: `Sessão de curral em andamento: ${sess.name}`,
      why: `${sm.done} de ${sm.total} realizados; ${sm.pending} pendente(s). Retome de onde parou.`,
      to: `/curral/${sess.id}`,
      action: "Retomar manejo",
    });
  }
  if (dueTasks.length) {
    priorities.push({
      icon: CalendarDays,
      title: `${dueTasks.length} tarefa(s) para hoje${overdue.length ? ` · ${overdue.length} atrasada(s)` : ""}`,
      why: dueTasks
        .slice(0, 2)
        .map((t) => t.title)
        .join(" · "),
      to: "/agenda",
      action: "Abrir agenda",
    });
  }
  if (calving30.length) {
    priorities.push({
      icon: Baby,
      title: `${calving30.length} parto(s) previsto(s)`,
      why: "Nos próximos 30 dias (estimativa a partir das coberturas e diagnósticos).",
      to: "/reproducao",
      action: "Ver matrizes",
    });
  }
  if (inWithdrawal) {
    priorities.push({
      icon: ShieldAlert,
      title: `${inWithdrawal} animal(is) em carência`,
      why: "Pelos prazos configurados nos produtos aplicados; a venda verifica esta lista.",
      to: "/sanidade?aba=carencias",
      action: "Ver carências",
    });
  }
  if (lowStock.length || stockReview) {
    priorities.push({
      icon: Package,
      title: stockReview
        ? `${stockReview} consumo(s) de estoque para conferir`
        : `${lowStock.length} produto(s) abaixo do mínimo`,
      why: stockReview
        ? "Aplicações registradas deixaram saldo negativo."
        : lowStock
            .slice(0, 3)
            .map((p) => p.name)
            .join(", "),
      to: "/fazenda/estoque",
      action: "Abrir estoque",
    });
  }
  if (problems) {
    priorities.push({
      icon: CircleAlert,
      title: `${problems} registro(s) para revisar`,
      why: "Não aceitos pelo servidor; corrija para não perder a informação.",
      to: "/fazenda/sincronizacao",
      action: "Revisar registros",
    });
  }
  if (notWeighed.length) {
    priorities.push({
      icon: Weight,
      title: `${notWeighed.length} sem pesagem recente`,
      why: "Sem pesagem nos últimos 90 dias; o GMD fica sem base.",
      to: "/registrar/pesagem",
      action: "Registrar pesagem",
    });
  }
  if (noGroup.length) {
    priorities.push({
      icon: MapPin,
      title: `${noGroup.length} animal(is) sem lote`,
      why: "Lotes organizam manejos em grupo e indicadores.",
      to: "/rebanho?semLote=1",
      action: "Ver animais",
    });
  }

  const g = greeting();
  const GreetIcon = g.night ? Moon : Sun;
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${today}T12:00:00Z`));
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${today}T12:00:00Z`),
  );
  const groups = places.filter((p) => p.kind === "group");
  const recent = [...active].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

  return (
    <section>
      <div className="hero">
        <div className="hero-greet">
          <GreetIcon size={52} color="var(--color-brand-ochre)" aria-hidden="true" />
          <div>
            <h1>
              <span className="mobile-only">
                {g.text}, {me?.user.name.split(" ")[0]}!
              </span>
              <span className="desk-only">Hoje na fazenda</span>
            </h1>
            <div className="farm-select">
              {farms.length > 1 ? (
                <>
                  <select
                    aria-label="Fazenda ativa"
                    value={farm!.id}
                    onChange={(e) => selectFarm(e.target.value)}
                  >
                    {farms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} aria-hidden="true" />
                </>
              ) : (
                <span>{farm!.name}</span>
              )}
            </div>
          </div>
        </div>
        <div className="today-date">
          <CalendarDays size={30} aria-hidden="true" />
          <div>
            <strong>{dateLabel}</strong>
            <span style={{ textTransform: "capitalize" }}>{weekday}</span>
          </div>
        </div>
        <Landscape />
      </div>

      <div className="tiles">
        <Link to="/rebanho" className="tile tile-sage">
          <BrandCow size={52} aria-hidden="true" />
          <div>
            <strong>{active.length}</strong>
            <span>animais</span>
          </div>
        </Link>
        <Link to="/agenda" className="tile tile-ochre">
          <ClipboardList size={46} aria-hidden="true" />
          <div>
            <strong>{tasks ? dueTasks.length : "—"}</strong>
            <span>{dueTasks.length === 1 ? "tarefa" : "tarefas"}</span>
          </div>
        </Link>
        <Link to="/rebanho?filtro=matrizes" className="tile tile-sage desk-only">
          <BrandCow size={52} aria-hidden="true" />
          <div>
            <strong>{cows}</strong>
            <span>matrizes</span>
          </div>
        </Link>
        <Link to="/rebanho?filtro=matrizes" className="tile tile-sage desk-only">
          <BrandCow size={52} aria-hidden="true" />
          <div>
            <strong>{pregnant}</strong>
            <span>prenhas</span>
          </div>
        </Link>
        <div className="tile tile-cream desk-only">
          <Weight size={46} aria-hidden="true" />
          <div>
            <strong>{weighed30}</strong>
            <span>pesados em 30 dias</span>
          </div>
        </div>
      </div>

      <div className="section-head" id="prioridades">
        <h2>
          <TriangleAlert
            size={26}
            color="var(--color-brand-ochre)"
            className="desk-only"
            aria-hidden="true"
          />
          <span className="mobile-only">Suas prioridades de hoje</span>
          <span className="desk-only">O que precisa de atenção</span>
        </h2>
      </div>
      {priorities.length === 0 ? (
        <div className="card">
          <p className="hint" style={{ margin: 0 }}>
            Nada pendente para hoje. Tarefas futuras ficam na Agenda.
          </p>
        </div>
      ) : (
        <div className="prio-list wide">
          {priorities.map((p) => (
            <Link key={p.title} to={p.to} className="prio">
              <div className="prio-main">
                <p.icon size={40} className="ic" aria-hidden="true" />
                <div style={{ flex: 1 }}>
                  <strong>{p.title}</strong>
                  <small>{p.why}</small>
                </div>
                <ChevronRight size={22} aria-hidden="true" />
              </div>
              <span className="prio-action">{p.action}</span>
            </Link>
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary btn-lg btn-block mobile-only"
        onClick={() => navigate(sessions[0] ? `/curral/${sessions[0].id}` : "/registrar")}
      >
        <Play size={22} aria-hidden="true" /> Iniciar manejo
      </button>

      <div className="grid dash desk-only" style={{ marginTop: 8 }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="section-head" style={{ padding: "16px 20px 4px" }}>
            <h2>
              <BrandCow size={30} color="var(--color-brand-leaf)" aria-hidden="true" /> Meu rebanho
            </h2>
            <Link to="/rebanho">
              Ver todos <ArrowRight size={18} />
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="hint" style={{ padding: "0 20px 16px" }}>
              Nenhum animal ainda. <Link to="/registrar/animal">Cadastrar</Link>
            </p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Animal</th>
                  <th>Brinco</th>
                  <th>Categoria</th>
                  <th>Lote</th>
                  <th>Peso (kg)</th>
                  <th>Idade</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => (
                  <tr key={a.id} onClick={() => navigate(`/rebanho/${a.id}`)}>
                    <td className="animal">
                      <AnimalPhoto size="sm" src={a.photo?.thumbUrl} />
                      <Link
                        to={`/rebanho/${a.id}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {CATEGORY_LABEL[a.category]} {a.primaryIdentifier}
                      </Link>
                    </td>
                    <td>{a.primaryIdentifier}</td>
                    <td className="hint">
                      {CATEGORY_LABEL[a.category]}
                      {a.breed ? ` ${a.breed}` : ""}
                    </td>
                    <td>{a.groupName ?? "—"}</td>
                    <td>{a.lastWeight ? a.lastWeight.weightKg.toLocaleString("pt-BR") : "—"}</td>
                    <td>{a.birthDate ? `${ageInMonths(a.birthDate, today)} m` : "—"}</td>
                    <td>
                      <ChevronRight size={18} aria-hidden="true" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <div className="section-head">
            <h2>
              <MapPin size={28} color="var(--color-brand-leaf)" aria-hidden="true" /> Lotes em uso
            </h2>
            <Link to="/fazenda/lotes">
              Ver todos <ArrowRight size={18} />
            </Link>
          </div>
          <p className="hint">Localização por manejo registrado (não por GPS).</p>
          {groups.length === 0 ? (
            <p className="hint">Nenhum lote cadastrado.</p>
          ) : (
            <ul className="list">
              {groups.map((g2) => {
                const n = active.filter((a) => a.groupId === g2.id).length;
                return (
                  <li key={g2.id}>
                    <Link className="list-item" to={`/rebanho?lote=${g2.id}`}>
                      <span>
                        <span className="title">{g2.name}</span>
                        <div className="meta">{n} animal(is)</div>
                      </span>
                      <ChevronRight size={18} aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
