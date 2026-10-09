import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { color } from "./index.ts";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}
const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

describe("design tokens", () => {
  it("CSS espelha os tokens TS", () => {
    const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
    for (const [k, v] of Object.entries(color)) {
      expect(css).toContain(`--color-${kebab(k)}: ${v};`);
    }
  });
  it.each([
    ["textPrimary", "canvas"],
    ["textSecondary", "canvas"],
    ["textOnBrand", "brandPrimary"],
    ["brandOchreText", "surface"],
    ["danger", "dangerBg"],
    ["warning", "warningBg"],
    ["success", "successBg"],
    ["info", "infoBg"],
    ["brandPrimary", "brandSage"],
  ] as const)("contraste WCAG AA para %s sobre %s", (fg, bg) => {
    expect(contrast(color[fg], color[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it("ocre puro NÃO é seguro para texto pequeno sobre branco", () => {
    expect(contrast(color.brandOchre, color.surface)).toBeLessThan(4.5);
  });
});
