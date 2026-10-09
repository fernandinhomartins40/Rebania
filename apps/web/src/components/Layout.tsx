import {
  Bell,
  Sparkles,
  CalendarDays,
  CirclePlus,
  House,
  MapPin,
  Plus,
  Venus,
  Warehouse,
} from "lucide-react";
import { BrandCow, type IconComponent } from "./brand.tsx";
import { NavLink, Outlet, Link } from "react-router";
import { useSession } from "../state/session.tsx";
import { initials, Logo } from "./brand.tsx";
import { SyncBadge } from "./SyncBadge.tsx";

const NAV: { to: string; label: string; icon: IconComponent; end?: boolean }[] = [
  { to: "/", label: "Hoje", icon: House, end: true },
  { to: "/rebanho", label: "Rebanho", icon: BrandCow },
  { to: "/registrar", label: "Registrar", icon: CirclePlus },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/fazenda", label: "Fazenda", icon: Warehouse },
];

/** Atalhos do desktop: só áreas implementadas (Reprodução, Sanidade etc. entram nos próximos goals). */
const SHORTCUTS: { to: string; label: string; icon: IconComponent }[] = [
  { to: "/reproducao", label: "Reprodução", icon: Venus },
  { to: "/fazenda/lotes", label: "Lotes e pastos", icon: MapPin },
];

export function Layout() {
  const { me } = useSession();
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Navegação principal">
        <Logo light />
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="nav">
            {({ isActive }) => (
              <>
                <n.icon
                  size={24}
                  className={isActive ? "icon-active" : undefined}
                  aria-hidden="true"
                />
                {n.label}
              </>
            )}
          </NavLink>
        ))}
        <hr />
        {SHORTCUTS.map((n) => (
          <NavLink key={n.to} to={n.to} className="nav">
            <n.icon size={24} aria-hidden="true" />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="main">
        <header className="appbar">
          <Logo />
          <span style={{ flex: 1 }} />
          <div className="appbar-actions">
            <SyncBadge compact />
            <Link to="/assistente" className="icon-btn" aria-label="Assistente inteligente">
              <Sparkles size={24} />
            </Link>
            <Link to="/agenda" className="icon-btn" aria-label="Avisos e tarefas">
              <Bell size={26} />
            </Link>
            <Link
              to="/fazenda/conta"
              className="avatar"
              aria-label={`Conta de ${me?.user.name ?? ""}`}
            >
              {initials(me?.user.name)}
            </Link>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
      <nav className="bottomnav" aria-label="Navegação principal">
        {NAV.map((n) =>
          n.to === "/registrar" ? (
            <NavLink key={n.to} to={n.to} className="register-cta">
              <span className="fab" aria-hidden="true">
                <Plus size={26} />
              </span>
              <span>{n.label}</span>
            </NavLink>
          ) : (
            <NavLink key={n.to} to={n.to} end={n.end}>
              {({ isActive }) => (
                <>
                  <n.icon
                    size={26}
                    className={isActive ? "icon-active" : undefined}
                    aria-hidden="true"
                  />
                  <span>{n.label}</span>
                </>
              )}
            </NavLink>
          ),
        )}
      </nav>
    </div>
  );
}
