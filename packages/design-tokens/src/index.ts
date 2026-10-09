/**
 * Tokens CANDIDATOS (MN §14). A logo e a direção visual aguardam aprovação
 * (docs/DECISIONS.md D-07). Alterar valores aqui propaga para web e nativo.
 */
export const color = {
  brandPrimary: "#163E32",
  brandPrimaryHover: "#0F2E25",
  brandSage: "#DDE6D8",
  brandOchre: "#C48A38",
  /** Ocre para títulos grandes (≥24px): contraste ≥3:1 sobre o fundo claro. */
  brandOchreDisplay: "#A87228",
  /** Fundo de cartões/indicadores em ocre suave (pranchas). */
  brandOchreSoft: "#F4E5CC",
  /** Ocre escurecido para texto/ícones pequenos sobre fundo claro (contraste AA). */
  brandOchreText: "#825519",
  canvas: "#F7F4ED",
  surface: "#FFFFFF",
  surfaceMuted: "#EFEBE1",
  /** Verde do ícone de vaca nos indicadores. */
  brandLeaf: "#3F8F4E",
  border: "#CBD5CC",
  textPrimary: "#182A24",
  textSecondary: "#4E6158",
  textOnBrand: "#FFFFFF",
  success: "#2E6B3F",
  successBg: "#E3F0E4",
  warning: "#8A5A16",
  warningBg: "#FBEFD9",
  danger: "#A3322A",
  dangerBg: "#F8E1DE",
  info: "#245A7A",
  infoBg: "#E0EDF5",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

export const typography = {
  family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  /** Corpo mobile de referência. */
  body: 16,
  small: 14,
  title: 22,
  display: 28,
} as const;

/** Alvo mínimo de toque para uso em campo. */
export const touchTarget = 48;

export const breakpoints = { tablet: 768, desktop: 1024, wide: 1280 } as const;
