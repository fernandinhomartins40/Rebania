import { NavLink, Outlet } from "react-router";
import { useSession } from "../state/session.tsx";
import { SyncBadge } from "./SyncBadge.tsx";

const NAV = [
  { to: "/", label: "Hoje", icon: "☀", end: true },
  { to: "/rebanho", label: "Rebanho", icon: "🐄" },
  { to: "/registrar", label: "Registrar", icon: "+", cta: true },
  { to: "/agenda", label: "Agenda", icon: "📅" },
  { to: "/fazenda", label: "Fazenda", icon: "🏠" },
];

export function Layout() {
  const { farm, farms, selectFarm } = useSession();
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Navegação principal">
        <div className="brand">rebania</div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <span className="navicon" aria-hidden="true">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="main">
        <div className="content">
          <header className="topbar">
            <div>
              {farms.length > 1 ? (
                <select
                  aria-label="Fazenda ativa"
                  value={farm?.id}
                  onChange={(e) => selectFarm(e.target.value)}
                  style={{ width: "auto" }}
                >
                  {farms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} · {f.organizationName}
                    </option>
                  ))}
                </select>
              ) : (
                <strong>{farm?.name}</strong>
              )}
              <div className="farm">{farm?.organizationName}</div>
            </div>
            <SyncBadge />
          </header>
          <Outlet />
        </div>
      </main>
      <nav className="bottomnav" aria-label="Navegação principal">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={n.cta ? "register-cta" : undefined}>
            <span className="navicon" aria-hidden="true">{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
