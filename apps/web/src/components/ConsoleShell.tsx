import {
  Activity,
  Building2,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  Package,
  ReceiptText,
  ScrollText,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { get } from "../api/client.ts";
import { ROLE_LABEL, StaffContext, type StaffMe } from "../pages/console/kit.tsx";
import "../pages/console/console.css";
import { useSession } from "../state/session.tsx";
import { Logo } from "./brand.tsx";
import { Loading } from "./ui.tsx";

const NAV: { to: string; label: string; icon: LucideIcon; perm: string; end?: boolean }[] = [
  {
    to: "/console",
    label: "Visão geral",
    icon: LayoutDashboard,
    perm: "customers.read",
    end: true,
  },
  { to: "/console/clientes", label: "Clientes", icon: Building2, perm: "customers.read" },
  { to: "/console/implantacoes", label: "Implantações", icon: ListChecks, perm: "customers.read" },
  { to: "/console/cobranca", label: "Cobrança", icon: ReceiptText, perm: "customers.read" },
  { to: "/console/planos", label: "Planos e créditos", icon: Package, perm: "customers.read" },
  { to: "/console/suporte", label: "Suporte", icon: LifeBuoy, perm: "customers.read" },
  { to: "/console/comunicados", label: "Comunicados", icon: Megaphone, perm: "customers.read" },
  { to: "/console/operacao", label: "Operação", icon: Activity, perm: "ops.read" },
  { to: "/console/auditoria", label: "Auditoria", icon: ScrollText, perm: "audit.read" },
  { to: "/console/equipe", label: "Equipe", icon: Users, perm: "team.manage" },
  { to: "/console/configuracoes", label: "Configurações", icon: Settings, perm: "settings.manage" },
];

/**
 * Console da plataforma: área própria da equipe Rebania (D-12), fora do app da fazenda.
 * O menu mostra só o que o papel da pessoa permite; o servidor valida cada ação.
 */
export function ConsoleShell() {
  const { me, logout } = useSession();
  const [staff, setStaff] = useState<StaffMe | null>(null);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    get<StaffMe>("/v1/platform/me").then(setStaff, () => setStaff({ isPlatformAdmin: false }));
  }, []);
  useEffect(() => setOpen(false), [location.pathname]);
  if (!staff) return <Loading />;
  const items = NAV.filter((n) => staff.permissions?.includes(n.perm));
  const nav = (
    <>
      {items.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className="nav">
          <n.icon size={22} aria-hidden="true" />
          {n.label}
        </NavLink>
      ))}
    </>
  );
  return (
    <StaffContext.Provider value={staff}>
      <div className="shell console-shell">
        <nav className="sidebar" aria-label="Console da plataforma">
          <Logo light to="/console" />
          <span className="console-tag">Console da plataforma</span>
          {nav}
        </nav>
        <div className="main">
          <header className="appbar">
            <button
              type="button"
              className="icon-btn console-menu-btn"
              aria-label="Abrir menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu size={24} />
            </button>
            <span className="console-mobile-logo">
              <Logo to="/console" />
            </span>
            <span style={{ flex: 1 }} />
            <div className="appbar-actions">
              <span className="console-who hide-narrow">
                <strong>{me?.user.name}</strong>
                <span className="hint">{staff.role ? ROLE_LABEL[staff.role] : ""}</span>
              </span>
              <Link to="/conta/senha" className="icon-btn" aria-label="Trocar senha">
                <KeyRound size={22} />
              </Link>
              <button
                type="button"
                className="icon-btn"
                aria-label="Sair"
                onClick={() => void logout()}
              >
                <LogOut size={22} />
              </button>
            </div>
          </header>
          <main className="content console-content">
            <Outlet />
          </main>
        </div>
        {open ? (
          <>
            <div className="drawer-backdrop" onClick={() => setOpen(false)} />
            <nav className="console-drawer" aria-label="Console da plataforma">
              <div className="console-drawer-head">
                <Logo light to="/console" />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Fechar menu"
                  onClick={() => setOpen(false)}
                >
                  <X size={24} />
                </button>
              </div>
              {nav}
            </nav>
          </>
        ) : null}
      </div>
    </StaffContext.Provider>
  );
}
