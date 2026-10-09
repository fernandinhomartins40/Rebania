import type { ComponentType } from "react";
import { Link } from "react-router";

/**
 * Logo oficial (docs/brand/pacote-landing). Símbolo e wordmark são recortes do
 * mesmo PNG — o texto da marca nunca é recomposto com fonte aproximada.
 * Variante clara apenas sobre fundo verde (nunca verde sobre verde).
 */
export function Logo({ light = false, to = "/" }: { light?: boolean; to?: string }) {
  const v = light ? "-light" : "";
  return (
    <Link to={to} className="logo" aria-label="Rebania — início">
      <img className="logo-symbol" src={`/brand/rebania-symbol${v}.png`} alt="" />
      <img className="logo-word" src={`/brand/rebania-wordmark${v}.png`} alt="" />
    </Link>
  );
}

/** Logo completa com tagline (login, landing, rodapé). */
export function FullLogo({ light = false, height = 64 }: { light?: boolean; height?: number }) {
  return (
    <img
      src={light ? "/brand/rebania-logo-light.png" : "/brand/rebania-logo.png"}
      alt="Rebania — Sua fazenda em dia."
      style={{ height, width: "auto", display: "block" }}
    />
  );
}

/**
 * Figura bovina da marca usada como ícone (o guia veda ícone genérico de vaca).
 * Máscara CSS sobre o símbolo PNG: herda `currentColor`, como os ícones Lucide.
 */
export function BrandCow({
  size = 24,
  className,
  color,
  ...rest
}: {
  size?: number;
  className?: string;
  color?: string;
  "aria-hidden"?: boolean | "true";
}) {
  return (
    <span
      className={`brand-cow ${className ?? ""}`}
      style={{ width: size, height: size, ...(color ? { color } : {}) }}
      aria-hidden={rest["aria-hidden"] ?? true}
    />
  );
}

export function initials(name: string | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")
  ).toUpperCase();
}

/** Paisagem ilustrada (vetorial) do cabeçalho "Hoje" — sem recortar as pranchas. */
export function Landscape() {
  return (
    <svg
      className="hero-landscape"
      viewBox="0 0 400 76"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#F7F4ED" stopOpacity="0" />
          <stop offset="1" stopColor="#EDE6D3" />
        </linearGradient>
      </defs>
      <rect width="400" height="76" fill="url(#sky)" />
      <path d="M0 44 C60 34 110 40 170 36 S300 30 400 38 V76 H0Z" fill="#C9D3B4" />
      <path d="M0 54 C80 46 150 52 230 48 S340 44 400 50 V76 H0Z" fill="#B7C59A" />
      <path d="M0 64 C90 58 200 64 400 58 V76 H0Z" fill="#A8B886" />
      {[
        [30, 40, 9],
        [62, 38, 7],
        [118, 39, 8],
        [205, 35, 7],
        [258, 37, 9],
        [336, 30, 16],
      ].map(([x, y, r]) => (
        <g key={x} fill="#4F6B3E">
          <rect x={x! - 1} y={y!} width="2" height={r! * 0.9} fill="#5B4A33" />
          <ellipse cx={x} cy={y} rx={r! * 1.3} ry={r! * 0.75} />
        </g>
      ))}
    </svg>
  );
}

/** Ícone aceito na navegação: Lucide ou a figura da marca. */
export type IconComponent = ComponentType<{
  size?: number;
  className?: string;
  color?: string;
  "aria-hidden"?: boolean | "true";
}>;
