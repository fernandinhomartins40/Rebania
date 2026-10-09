import { ArrowRight, CalendarDays, ChevronDown, ChevronRight, CircleAlert, ClipboardList, MapPin, Moon, Play, Sun, TriangleAlert, Weight } from "lucide-react";
import { BrandCow, type IconComponent } from "../components/brand.tsx";
import { addDays, ageInMonths, CATEGORY_LABEL, daysBetween, todayInTimezone } from "@rebania/domain";
import { Link, useNavigate } from "react-router";
import { Landscape } from "../components/brand.tsx";
import { AnimalPhoto, Loading } from "../components/ui.tsx";
import { useLocalHerd } from "../state/local-data.ts";
import { useSession } from "../state/session.tsx";
import { useSync } from "../state/sync.tsx";

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
  const navigate = useNavigate();
  if (!animals) return <Loading />;

  const today = todayInTimezone(farm!.timezone);
  const active = animals.filter((a) => a.status === "active");
  const cows = active.filter((a) => a.category === "cow").length;
  const weighed30 = active.filter((a) => a.lastWeight && daysBetween(addDays(today, -30), a.lastWeight.measuredOn) >= 0).length;
  const notWeighed = active.filter((a) => !a.lastWeight || daysBetween(addDays(today, -90), a.lastWeight.measuredOn) < 0);
  const noGroup = active.filter((a) => !a.groupId);
  const problems = state.rejected + state.conflict;

  const priorities: Priority[] = [];
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
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${today}T12:00:00Z`),
  );
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" }).format(new Date(`${today}T12:00:00Z`));
  const groups = places.filter((p) => p.kind === "group");
  const recent = [...active].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

  return (
    <section>
      <div className="hero">
        <div className="hero-greet">
          <GreetIcon size={52} color="var(--color-brand-ochre)" aria-hidden="true" />
          <div>
            <h1>
              <span className="mobile-only">{g.text}, {me?.user.name.split(" ")[0]}!</span>
              <span className="desk-only">Hoje na fazenda</span>
            </h1>
            <div className="farm-select">
              {farms.length > 1 ? (
                <>
                  <select aria-label="Fazenda ativa" value={farm!.id} onChange={(e) => selectFarm(e.target.value)}>
                    {farms.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
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
          <div><strong>{active.length}</strong><span>animais</span></div>
        </Link>
        <a href="#prioridades" className="tile tile-ochre">
          <ClipboardList size={46} aria-hidden="true" />
          <div><strong>{priorities.length}</strong><span>{priorities.length === 1 ? "pendência" : "pendências"}</span></div>
        </a>
        <Link to="/rebanho?filtro=matrizes" className="tile tile-sage desk-only">
          <BrandCow size={52} aria-hidden="true" />
          <div><strong>{cows}</strong><span>matrizes</span></div>
        </Link>
        <div className="tile tile-cream desk-only">
          <Weight size={46} aria-hidden="true" />
          <div><strong>{weighed30}</strong><span>pesados em 30 dias</span></div>
        </div>
      </div>

      <div className="section-head" id="prioridades">
        <h2>
          <TriangleAlert size={26} color="var(--color-brand-ochre)" className="desk-only" aria-hidden="true" />
          <span className="mobile-only">Suas prioridades de hoje</span>
          <span className="desk-only">O que precisa de atenção</span>
        </h2>
      </div>
      {priorities.length === 0 ? (
        <div className="card">
          <p className="hint" style={{ margin: 0 }}>
            Nada pendente pelos critérios disponíveis. A agenda de partos e vacinações chega com os módulos de reprodução e sanidade.
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

      <button type="button" className="btn btn-primary btn-lg btn-block mobile-only" onClick={() => navigate("/registrar")}>
        <Play size={22} aria-hidden="true" /> Iniciar manejo
      </button>

      <div className="grid dash desk-only" style={{ marginTop: 8 }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="section-head" style={{ padding: "16px 20px 4px" }}>
            <h2><BrandCow size={30} color="var(--color-brand-leaf)" aria-hidden="true" /> Meu rebanho</h2>
            <Link to="/rebanho">Ver todos <ArrowRight size={18} /></Link>
          </div>
          {recent.length === 0 ? (
            <p className="hint" style={{ padding: "0 20px 16px" }}>Nenhum animal ainda. <Link to="/registrar/animal">Cadastrar</Link></p>
          ) : (
            <table className="data">
              <thead><tr><th>Animal</th><th>Brinco</th><th>Categoria</th><th>Lote</th><th>Peso (kg)</th><th>Idade</th><th /></tr></thead>
              <tbody>
                {recent.map((a) => (
                  <tr key={a.id} onClick={() => navigate(`/rebanho/${a.id}`)}>
                    <td className="animal"><AnimalPhoto size="sm" /><Link to={`/rebanho/${a.id}`} style={{ color: "inherit", textDecoration: "none" }}>{CATEGORY_LABEL[a.category]} {a.primaryIdentifier}</Link></td>
                    <td>{a.primaryIdentifier}</td>
                    <td className="hint">{CATEGORY_LABEL[a.category]}{a.breed ? ` ${a.breed}` : ""}</td>
                    <td>{a.groupName ?? "—"}</td>
                    <td>{a.lastWeight ? a.lastWeight.weightKg.toLocaleString("pt-BR") : "—"}</td>
                    <td>{a.birthDate ? `${ageInMonths(a.birthDate, today)} m` : "—"}</td>
                    <td><ChevronRight size={18} aria-hidden="true" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <div className="section-head">
            <h2><MapPin size={28} color="var(--color-brand-leaf)" aria-hidden="true" /> Lotes em uso</h2>
            <Link to="/fazenda/lotes">Ver todos <ArrowRight size={18} /></Link>
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
                      <span><span className="title">{g2.name}</span><div className="meta">{n} animal(is)</div></span>
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
