import { normalizeIdentifier } from "@rebania/domain";

/**
 * Interpreta a linha enviada por um leitor de bastão RFID (modo teclado/serial).
 * Formatos comuns de leitores ISO 11784/11785 FDX-B/HDX:
 *   "982 000123456789", "982000123456789", "982-000123456789",
 *   prefixos de tipo como "FDX-B 982 000123456789" ou "A0000000982000123456789"
 *   (alguns firmwares acrescentam flags antes do código de 15 dígitos).
 * Retorna null quando não há código ISO reconhecível — nunca "adivinha".
 */
export function parseRfidLine(line: string): string | null {
  const cleaned = line.trim().toUpperCase();
  if (!cleaned) return null;
  const digits = cleaned.replace(/^(FDX-?B|HDX)\s*/, "").replace(/[\s.-]/g, "");
  const iso = /(\d{15})$/.exec(digits.replace(/^[A-Z]\d*?(?=\d{15}$)/, ""));
  if (!iso) return null;
  try {
    return normalizeIdentifier("rfid", iso[1]!);
  } catch {
    return null;
  }
}

/**
 * Interpreta a saída textual de balanças (formatos ASCII comuns):
 *   "ST,GS,+  0462.5kg", "US,GS,+  0461.0kg" (ST=estável, US=instável),
 *   "462.5", "W: 462,5 kg".
 */
export function parseScaleLine(line: string): { weightKg: number; stable: boolean } | null {
  const text = line.trim().toUpperCase();
  if (!text) return null;
  const unstable = /\bUS\b|MOTION|INSTAV/.test(text);
  const m = /([+-]?\s*\d+(?:[.,]\d+)?)\s*(KG)?\s*$/.exec(text.replace(/[^\d.,+\-KG\s]/g, " ").trim());
  if (!m) return null;
  const n = Number(m[1]!.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return { weightKg: Math.round(n * 100) / 100, stable: !unstable };
}
