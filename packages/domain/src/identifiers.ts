import { DomainError } from "./errors.ts";

/**
 * Identificadores são apelidos (aliases) do animal: o ID interno nunca muda.
 * Leitura de identificador apenas localiza um registro autorizado; não é autenticação.
 */
export const IDENTIFIER_TYPES = [
  "visual_tag",
  "rfid",
  "nfc",
  "qr",
  "provisional",
  "other",
] as const;
export type IdentifierType = (typeof IDENTIFIER_TYPES)[number];

export const IDENTIFIER_LABEL: Record<IdentifierType, string> = {
  visual_tag: "Brinco visual",
  rfid: "RFID (ISO 11784/11785)",
  nfc: "Tag NFC",
  qr: "QR code",
  provisional: "ID provisório",
  other: "Outro",
};

/**
 * Normaliza o valor para comparação/unicidade. O valor original digitado/lido é
 * preservado separadamente para auditoria.
 */
export function normalizeIdentifier(type: IdentifierType, raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new DomainError("identifier_empty", "Informe o identificador.");
  }
  switch (type) {
    case "rfid": {
      // Leitores apresentam ISO 11784 como "982 000123456789", "982000123456789" ou "982-000123456789".
      const digits = trimmed.replace(/[\s.-]/g, "");
      if (!/^\d{15}$/.test(digits)) {
        throw new DomainError(
          "rfid_invalid",
          "RFID pecuário deve ter 15 dígitos (código do país/fabricante + número).",
          { value: raw },
        );
      }
      return digits;
    }
    case "nfc": {
      const hex = trimmed.replace(/[\s:-]/g, "").toUpperCase();
      if (!/^[0-9A-F]{8,20}$/.test(hex)) {
        throw new DomainError("nfc_invalid", "UID NFC deve estar em hexadecimal.", { value: raw });
      }
      return hex;
    }
    case "visual_tag":
    case "provisional":
    case "other": {
      // Brincos: ignora espaços e caixa; zeros à esquerda são significativos ("0512" ≠ "512")
      // porque muitas fazendas imprimem o número com zeros.
      const value = trimmed.replace(/\s+/g, "").toUpperCase();
      if (value.length > 40) {
        throw new DomainError("identifier_too_long", "Identificador muito longo (máx. 40).");
      }
      return value;
    }
    case "qr":
      if (trimmed.length > 200) {
        throw new DomainError("identifier_too_long", "Conteúdo do QR muito longo (máx. 200).");
      }
      return trimmed;
  }
}

/** Formatação para exibição de RFID ISO: "982 000123456789". */
export function formatIdentifier(type: IdentifierType, normalized: string): string {
  if (type === "rfid" && normalized.length === 15) {
    return `${normalized.slice(0, 3)} ${normalized.slice(3)}`;
  }
  return normalized;
}

/**
 * Ao ler um valor sem saber o tipo (ex.: campo de busca), devolve as
 * interpretações possíveis para consulta.
 */
export function candidateIdentifiers(raw: string): { type: IdentifierType; value: string }[] {
  const out: { type: IdentifierType; value: string }[] = [];
  for (const type of IDENTIFIER_TYPES) {
    try {
      out.push({ type, value: normalizeIdentifier(type, raw) });
    } catch {
      // interpretação inválida para este tipo
    }
  }
  return out;
}
