/** CPF/CNPJ do cliente: guardado só com dígitos e conferido pelos dígitos verificadores. */

export type TaxIdKind = "cpf" | "cnpj";

export const onlyDigits = (v: string) => v.replace(/\D+/g, "");

function checkDigit(base: string, weights: number[]) {
  const sum = weights.reduce((acc, w, i) => acc + Number(base[i]) * w, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

function validCpf(d: string) {
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const d1 = checkDigit(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = checkDigit(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[9]) && d2 === Number(d[10]);
}

function validCnpj(d: string) {
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const d1 = checkDigit(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = checkDigit(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[12]) && d2 === Number(d[13]);
}

/** Tipo do documento se for um CPF ou CNPJ válido; `null` caso contrário. */
export function taxIdKind(value: string): TaxIdKind | null {
  const d = onlyDigits(value);
  if (validCpf(d)) return "cpf";
  if (validCnpj(d)) return "cnpj";
  return null;
}

/** 000.000.000-00 ou 00.000.000/0000-00; outro conteúdo volta como veio. */
export function formatTaxId(value: string | null | undefined): string {
  if (!value) return "";
  const d = onlyDigits(value);
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return value;
}

/** Máscara durante a digitação (até 14 dígitos). */
export function maskTaxId(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 11)
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}
